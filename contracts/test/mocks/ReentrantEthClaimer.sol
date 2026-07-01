// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DropFactory } from "../../src/DropFactory.sol";
import { MerkleDrop } from "../../src/MerkleDrop.sol";

/// @notice Malicious participant used to prove that native `claim`/`sweep` are
///         reentrancy-safe. It can act as a claimer (its address is a Merkle
///         leaf) and/or as the drop operator (it creates the drop, so it may
///         sweep). Whenever it receives ETH it retaliates by reentering the
///         drop; the reentrant call MUST revert with OpenZeppelin's
///         `ReentrancyGuardReentrantCall` — CEI marks state before the transfer
///         and `nonReentrant` locks the drop. It swallows the revert with
///         try/catch and records the *reason selector* so tests can assert the
///         guard (not an incidental `AlreadyClaimed`/zero-balance no-op) is what
///         fired. Swallowing keeps its own `receive` successful, letting the
///         *outer* call complete; otherwise `safeTransferETH` would just bubble
///         the attacker's own revert and prove nothing about the guard.
contract ReentrantEthClaimer {
    /// @notice How the receiver retaliates when it is paid.
    enum Attack {
        NONE, // behave like a normal receiver
        CLAIM, // reenter claim() with the configured reentry leaf
        SWEEP // reenter sweep()
    }

    /// @dev Set after deployment: the drop's Merkle root must commit to this
    ///      contract's address, so the receiver is deployed *before* the drop.
    MerkleDrop public drop;

    Attack public attack;

    // This receiver's own leaf (used by the outer, legitimate claim()).
    uint256 public index;
    uint256 public amount;
    bytes32[] public proof;

    // The leaf the receive() callback reenters claim() with. Same as the own leaf
    // exercises same-index reentry; a sibling leaf exercises cross-index reentry.
    uint256 public reIndex;
    uint256 public reAmount;
    bytes32[] public reProof;

    /// @notice True once a reentrant attempt was made and observed to revert.
    bool public reentryReverted;
    /// @notice Selector of the revert that stopped the reentry (expected: guard).
    bytes4 public reentryReason;
    /// @notice Number of times `receive` fired (one legitimate payment => 1).
    uint256 public received;

    /// @notice Create a native drop with this contract as the operator (so it
    ///         is authorized to sweep). Returns and stores the deployed drop.
    function createNative(
        DropFactory factory,
        bytes32 root,
        uint256 totalAmount,
        uint64 startTime,
        uint64 deadline
    ) external payable returns (MerkleDrop) {
        uint8 csv = uint8(DropFactory.AirdropType.CSV);
        address deployed = factory.createDrop{ value: msg.value }(
            csv, factory.NATIVE(), root, totalAmount, startTime, deadline, address(0)
        );
        drop = MerkleDrop(payable(deployed));
        return drop;
    }

    /// @dev Wire an externally deployed drop (when this contract is only a claimer).
    function setDrop(MerkleDrop drop_) external {
        drop = drop_;
    }

    /// @dev Configure this receiver's own allocation and how it retaliates.
    function arm(Attack attack_, uint256 index_, uint256 amount_, bytes32[] calldata proof_) external {
        attack = attack_;
        index = index_;
        amount = amount_;
        proof = proof_;
    }

    /// @dev Configure the leaf that the receive() callback reenters claim() with.
    function armReentry(uint256 index_, uint256 amount_, bytes32[] calldata proof_) external {
        reIndex = index_;
        reAmount = amount_;
        reProof = proof_;
    }

    /// @notice Kick off the legitimate claim; the attack (if any) fires from `receive`.
    function claim() external {
        drop.claim(index, address(this), amount, proof);
    }

    /// @notice Kick off a legitimate sweep (operator only); the attack fires from `receive`.
    function sweep() external {
        drop.sweep();
    }

    receive() external payable {
        received++;
        if (attack == Attack.NONE) return;

        if (attack == Attack.SWEEP) {
            try drop.sweep() {
            // Reentry unexpectedly succeeded — leave reentryReverted false so the test fails loudly.
            }
            catch (bytes memory reason) {
                reentryReverted = true;
                reentryReason = bytes4(reason);
            }
        } else {
            try drop.claim(reIndex, address(this), reAmount, reProof) {
            // ditto
            }
            catch (bytes memory reason) {
                reentryReverted = true;
                reentryReason = bytes4(reason);
            }
        }
    }
}
