// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "solmate/tokens/ERC20.sol";
import { SafeTransferLib } from "solmate/utils/SafeTransferLib.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { BitMaps } from "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { LibClone } from "solady/utils/LibClone.sol";

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
///
///      DEPLOYMENT: deployed once as an implementation; every campaign is an
///      EIP-1167 clone-with-immutable-args (Solady `LibClone.clone(impl, args)`).
///      The campaign config is `abi.encode`d into the clone's bytecode and read
///      back with Solady's audited `argsOnClone` + `abi.decode` — no per-drop
///      storage for config (claims stay cheap) and no constructor/initializer.
///      The factory validates the config before cloning (it is the sole creator).
contract MerkleDrop is ReentrancyGuard {
    using SafeTransferLib for ERC20;
    using BitMaps for BitMaps.BitMap;

    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sentinel `token` value meaning "distribute native ETH".
    address public constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

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
                          IMMUTABLE-ARGS CONFIG
    //////////////////////////////////////////////////////////////*/

    /// @dev Decode this clone's immutable args (baked into its bytecode by the
    ///      factory via `LibClone.clone(impl, abi.encode(...))`). Order MUST match
    ///      the factory's `abi.encode`. Cheap: an EXTCODECOPY of the clone's own
    ///      code tail + a standard `abi.decode` (no per-drop storage reads).
    function _config()
        internal
        view
        returns (
            address token_,
            bytes32 merkleRoot_,
            uint64 startTime_,
            uint64 deadline_,
            address identityRegistry_,
            address operator_,
            address factory_
        )
    {
        return abi.decode(
            LibClone.argsOnClone(address(this)),
            (address, bytes32, uint64, uint64, address, address, address)
        );
    }

    /// @notice Asset being distributed: an ERC20 address, or `NATIVE` for ETH.
    function token() external view returns (address t) {
        (t,,,,,,) = _config();
    }

    /// @notice True when the drop distributes native ETH (`token == NATIVE`).
    function isNative() external view returns (bool) {
        (address t,,,,,,) = _config();
        return t == NATIVE;
    }

    /// @notice Merkle root committing to all `(index, account, amount)` allocations.
    function merkleRoot() external view returns (bytes32 r) {
        (, r,,,,,) = _config();
    }

    /// @notice Unix timestamp at/after which claims open.
    function startTime() external view returns (uint64 s) {
        (,, s,,,,) = _config();
    }

    /// @notice Unix timestamp after which claims are closed and sweep is allowed.
    function deadline() external view returns (uint64 d) {
        (,,, d,,,) = _config();
    }

    /// @notice zk-X509 registry gating customer (claimer) identity (0 = open claim).
    function identityRegistry() external view returns (IIdentityRegistry) {
        (,,,, address r,,) = _config();
        return IIdentityRegistry(r);
    }

    /// @notice Campaign operator; the only address allowed to sweep leftovers.
    function operator() external view returns (address o) {
        (,,,,, o,) = _config();
    }

    /// @notice Factory that deployed this drop.
    function factory() external view returns (address f) {
        (,,,,,, f) = _config();
    }

    /// @notice Accept ETH funding for native drops (funded by the factory after
    ///         cloning). ERC20 drops reject ETH so funds can't get stuck — their
    ///         sweep only moves the token balance.
    receive() external payable {
        (address token_,,,,,,) = _config();
        if (token_ != NATIVE) revert EthNotAccepted();
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
        (
            address token_,
            bytes32 merkleRoot_,
            uint64 startTime_,
            uint64 deadline_,
            address identityRegistry_,
            ,
        ) = _config();

        // Guards run cheapest-first; the external identity call is the single
        // most expensive op, so it runs last — an ineligible/tampered claim
        // reverts on the in-memory proof check before paying for it.
        if (block.timestamp < startTime_) revert ClaimNotStarted();
        if (block.timestamp > deadline_) revert ClaimClosed();
        if (account != msg.sender) revert NotSelfClaim();
        if (_claimed.get(index)) revert AlreadyClaimed();

        bytes32 leaf = keccak256(abi.encodePacked(index, account, amount));
        if (!MerkleProof.verify(proof, merkleRoot_, leaf)) revert InvalidProof();

        // Optional customer gate (W24): only when an identityRegistry is set.
        // address(0) = open claim (merkle proof + self-claim still enforced).
        // The check is last among the guards: it is `view` (STATICCALL) so it
        // cannot reenter, and ordering it after the in-memory checks avoids
        // paying for it (and the SSTORE below) on a cheaper revert.
        if (
            identityRegistry_ != address(0)
                && IIdentityRegistry(identityRegistry_).verifiedUntil(msg.sender) < block.timestamp
        ) revert NotVerified();

        // Effects before the value-moving interaction (CEI): mark the index
        // claimed before the transfer, so a token/ETH-recipient callback cannot
        // reenter `claim` with the same index. `nonReentrant` backs this up on
        // the native path, which makes an external ETH call.
        _claimed.set(index);
        if (token_ == NATIVE) {
            SafeTransferLib.safeTransferETH(msg.sender, amount);
        } else {
            ERC20(token_).safeTransfer(msg.sender, amount);
        }

        emit Claimed(index, account, amount);
    }

    /*//////////////////////////////////////////////////////////////
                                 SWEEP
    //////////////////////////////////////////////////////////////*/

    /// @notice After the deadline, the operator reclaims any unclaimed funds
    ///         (tokens or ETH) to its own address.
    function sweep() external nonReentrant {
        (address token_,,, uint64 deadline_,, address operator_,) = _config();
        if (msg.sender != operator_) revert NotOperator();
        if (block.timestamp <= deadline_) revert SweepTooEarly();

        bool native = token_ == NATIVE;
        uint256 balance = native ? address(this).balance : ERC20(token_).balanceOf(address(this));
        // Skip the transfer when nothing is left: some ERC20s revert on a
        // zero-value transfer, and emitting Swept(0) would be noise.
        if (balance > 0) {
            if (native) {
                SafeTransferLib.safeTransferETH(operator_, balance);
            } else {
                ERC20(token_).safeTransfer(operator_, balance);
            }
            emit Swept(operator_, balance);
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
