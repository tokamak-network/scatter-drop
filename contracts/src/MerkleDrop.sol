// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "solmate/tokens/ERC20.sol";
import { SafeTransferLib } from "solmate/utils/SafeTransferLib.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { BitMaps } from "@openzeppelin/contracts/utils/structs/BitMaps.sol";

import { IIdentityRegistry } from "./interfaces/IIdentityRegistry.sol";

/// @title MerkleDrop
/// @notice A single airdrop campaign whose claims are gated by zk-X509 identity
///         verification. Allocations are committed as a Merkle root; recipients
///         self-claim against an inclusion proof.
/// @dev Leaf encoding is fixed and MUST stay byte-for-byte identical to the
///      off-chain `packages/merkle` library:
///        keccak256(abi.encodePacked(uint256 index, address account, uint256 amount))
///      Internal nodes use OpenZeppelin's commutative (sorted-pair) hashing, so
///      proofs carry no sibling-position metadata.
contract MerkleDrop {
    using SafeTransferLib for ERC20;
    using BitMaps for BitMaps.BitMap;

    /*//////////////////////////////////////////////////////////////
                                IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Factory that deployed this drop (the deployer).
    address public immutable factory;

    /// @notice ERC20 token being distributed.
    ERC20 public immutable token;

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

    /// @notice Emitted when the operator sweeps unclaimed tokens after the deadline.
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

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param token_ ERC20 token to distribute.
    /// @param merkleRoot_ Root committing to all allocations.
    /// @param startTime_ Unix timestamp at/after which claims open.
    /// @param deadline_ Unix timestamp after which claims close.
    /// @param identityRegistry_ zk-X509 registry gating claimers.
    /// @param operator_ Campaign operator (sweep authority).
    constructor(
        ERC20 token_,
        bytes32 merkleRoot_,
        uint64 startTime_,
        uint64 deadline_,
        IIdentityRegistry identityRegistry_,
        address operator_
    ) {
        // identityRegistry_ is OPTIONAL (W24): address(0) = no customer gate (open claim).
        if (address(token_) == address(0) || operator_ == address(0)) {
            revert ZeroAddress();
        }
        // Guard standalone deployments: solmate's SafeTransferLib treats a call
        // to a codeless address as success, so a non-contract token would let
        // claims "succeed" while moving nothing. The factory path already checks
        // this, but MerkleDrop can be deployed directly.
        if (address(token_).code.length == 0) revert NotAContract();
        if (deadline_ <= block.timestamp) revert DeadlineInPast();
        // Claim window must be non-empty (open strictly before it closes).
        if (deadline_ <= startTime_) revert InvalidWindow();

        factory = msg.sender;
        token = token_;
        merkleRoot = merkleRoot_;
        startTime = startTime_;
        deadline = deadline_;
        identityRegistry = identityRegistry_;
        operator = operator_;
    }

    /*//////////////////////////////////////////////////////////////
                                 CLAIM
    //////////////////////////////////////////////////////////////*/

    /// @notice Claim an allocation. The caller must be the allocated `account`
    ///         and must currently be identity-verified.
    /// @param index Leaf index in the Merkle tree.
    /// @param account Allocated recipient (must equal `msg.sender`).
    /// @param amount Token amount allocated to `account`.
    /// @param proof Merkle inclusion proof for the leaf.
    function claim(uint256 index, address account, uint256 amount, bytes32[] calldata proof) external {
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
        // claimed before the transfer, so a token with a transfer callback
        // cannot reenter `claim` with the same index.
        _claimed.set(index);
        token.safeTransfer(msg.sender, amount);

        emit Claimed(index, account, amount);
    }

    /*//////////////////////////////////////////////////////////////
                                 SWEEP
    //////////////////////////////////////////////////////////////*/

    /// @notice After the deadline, the operator reclaims any unclaimed tokens
    ///         to its own address.
    function sweep() external {
        if (msg.sender != operator) revert NotOperator();
        if (block.timestamp <= deadline) revert SweepTooEarly();

        uint256 balance = token.balanceOf(address(this));
        // Skip the transfer when nothing is left: some ERC20s revert on a
        // zero-value transfer, and emitting Swept(0) would be noise.
        if (balance > 0) {
            token.safeTransfer(operator, balance);
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
