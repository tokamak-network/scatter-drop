// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "solmate/tokens/ERC20.sol";
import { SafeTransferLib } from "solmate/utils/SafeTransferLib.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { BitMaps } from "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IIdentityRegistry } from "./interfaces/IIdentityRegistry.sol";

/// @title MerkleDrop
/// @notice A single airdrop campaign whose claims are gated by zk-X509 identity
///         verification. Allocations are committed as a Merkle root; recipients
///         self-claim against an inclusion proof.
/// @dev Distributes either an ERC20 token or native ETH. Native drops use the
///      sentinel token address `NATIVE` (0xEeee…EEeE): claims pay ETH via a
///      low-level call and the contract holds ETH instead of an ERC20 balance.
///      Leaf encoding is fixed and MUST stay byte-for-byte identical to the
///      off-chain `packages/merkle` library:
///        keccak256(abi.encodePacked(uint256 index, address account, uint256 amount))
///      Internal nodes use OpenZeppelin's commutative (sorted-pair) hashing, so
///      proofs carry no sibling-position metadata. Claims are `nonReentrant`
///      (the native path makes an external ETH call), with CEI ordering as the
///      primary guard.
contract MerkleDrop is ReentrancyGuard {
    using SafeTransferLib for ERC20;
    using BitMaps for BitMaps.BitMap;

    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sentinel `token` value meaning "distribute native ETH".
    address public constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /*//////////////////////////////////////////////////////////////
                                IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Factory that deployed this drop (the deployer).
    address public immutable factory;

    /// @notice Asset being distributed: an ERC20 address, or `NATIVE` for ETH.
    address public immutable token;

    /// @notice True when the drop distributes native ETH (`token == NATIVE`).
    bool public immutable isNative;

    /// @notice Merkle root committing to all `(index, account, amount)` allocations.
    bytes32 public immutable merkleRoot;

    /// @notice Unix timestamp at/after which claims open.
    uint64 public immutable startTime;

    /// @notice Unix timestamp after which claims are closed and sweep is allowed.
    uint64 public immutable deadline;

    /// @notice zk-X509 registry gating customer (claimer) identity.
    IIdentityRegistry public immutable identityRegistry;

    /// @notice Campaign operator; the only address allowed to sweep leftovers.
    address public immutable operator;

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @dev Packed bitmap tracking which leaf indices have been claimed.
    BitMaps.BitMap private _claimed;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted on a successful claim.
    event Claimed(uint256 indexed index, address indexed account, uint256 amount);

    /// @notice Emitted when the operator sweeps unclaimed funds after the deadline.
    event Swept(address indexed to, uint256 amount);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error ZeroAddress();
    error NotAContract();
    error DeadlineInPast();
    error InvalidWindow();
    error ClaimNotStarted();
    error ClaimClosed();
    error NotSelfClaim();
    error NotVerified();
    error AlreadyClaimed();
    error InvalidProof();
    error SweepTooEarly();
    error NotOperator();
    error EthNotAccepted();

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param token_ ERC20 token to distribute, or `NATIVE` for native ETH.
    /// @param merkleRoot_ Root committing to all allocations.
    /// @param startTime_ Unix timestamp at/after which claims open.
    /// @param deadline_ Unix timestamp after which claims close.
    /// @param identityRegistry_ zk-X509 registry gating claimers.
    /// @param operator_ Campaign operator (sweep authority).
    constructor(
        address token_,
        bytes32 merkleRoot_,
        uint64 startTime_,
        uint64 deadline_,
        IIdentityRegistry identityRegistry_,
        address operator_
    ) {
        // identityRegistry_ is OPTIONAL (W24): address(0) = no customer gate (open claim).
        if (token_ == address(0) || operator_ == address(0)) {
            revert ZeroAddress();
        }
        bool native = token_ == NATIVE;
        // Guard standalone deployments: solmate's SafeTransferLib treats a call
        // to a codeless address as success, so a non-contract ERC20 would let
        // claims "succeed" while moving nothing. Native ETH has no token
        // contract, so the check only applies to the ERC20 path.
        if (!native && token_.code.length == 0) revert NotAContract();
        if (deadline_ <= block.timestamp) revert DeadlineInPast();
        // Claim window must be non-empty (open strictly before it closes).
        if (deadline_ <= startTime_) revert InvalidWindow();

        factory = msg.sender;
        token = token_;
        isNative = native;
        merkleRoot = merkleRoot_;
        startTime = startTime_;
        deadline = deadline_;
        identityRegistry = identityRegistry_;
        operator = operator_;
    }

    /// @notice Accept ETH funding for native drops (funded by the factory after
    ///         deployment). ERC20 drops reject ETH so funds can't get stuck —
    ///         their sweep only moves the token balance.
    receive() external payable {
        if (!isNative) revert EthNotAccepted();
    }

    /*//////////////////////////////////////////////////////////////
                                 CLAIM
    //////////////////////////////////////////////////////////////*/

    /// @notice Claim an allocation. The caller must be the allocated `account`
    ///         and must currently be identity-verified.
    /// @param index Leaf index in the Merkle tree.
    /// @param account Allocated recipient (must equal `msg.sender`).
    /// @param amount Amount (ERC20 units or wei) allocated to `account`.
    /// @param proof Merkle inclusion proof for the leaf.
    function claim(uint256 index, address account, uint256 amount, bytes32[] calldata proof)
        external
        nonReentrant
    {
        // Guards run cheapest-first; the external identity call is the single
        // most expensive op, so it runs last — an ineligible/tampered claim
        // reverts on the in-memory proof check before paying for it.
        if (block.timestamp < startTime) revert ClaimNotStarted();
        if (block.timestamp > deadline) revert ClaimClosed();
        if (account != msg.sender) revert NotSelfClaim();
        if (_claimed.get(index)) revert AlreadyClaimed();

        bytes32 leaf = keccak256(abi.encodePacked(index, account, amount));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert InvalidProof();

        // Optional customer gate (W24): only when an identityRegistry is set.
        // address(0) = open claim (merkle proof + self-claim still enforced).
        // The check is last among the guards: it is `view` (STATICCALL) so it
        // cannot reenter, and ordering it after the in-memory checks avoids
        // paying for it (and the SSTORE below) on a cheaper revert.
        if (
            address(identityRegistry) != address(0)
                && identityRegistry.verifiedUntil(msg.sender) < block.timestamp
        ) revert NotVerified();

        // Effects before the value-moving interaction (CEI): mark the index
        // claimed before the transfer, so a token/ETH-recipient callback cannot
        // reenter `claim` with the same index. `nonReentrant` backs this up on
        // the native path, which makes an external ETH call.
        _claimed.set(index);
        if (isNative) {
            SafeTransferLib.safeTransferETH(msg.sender, amount);
        } else {
            ERC20(token).safeTransfer(msg.sender, amount);
        }

        emit Claimed(index, account, amount);
    }

    /*//////////////////////////////////////////////////////////////
                                 SWEEP
    //////////////////////////////////////////////////////////////*/

    /// @notice After the deadline, the operator reclaims any unclaimed funds
    ///         (tokens or ETH) to its own address.
    function sweep() external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        if (block.timestamp <= deadline) revert SweepTooEarly();

        uint256 balance = isNative ? address(this).balance : ERC20(token).balanceOf(address(this));
        // Skip the transfer when nothing is left: some ERC20s revert on a
        // zero-value transfer, and emitting Swept(0) would be noise.
        if (balance > 0) {
            if (isNative) {
                SafeTransferLib.safeTransferETH(operator, balance);
            } else {
                ERC20(token).safeTransfer(operator, balance);
            }
            emit Swept(operator, balance);
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Whether the allocation at `index` has been claimed.
    function isClaimed(uint256 index) public view returns (bool) {
        return _claimed.get(index);
    }
}
