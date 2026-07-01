// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";

import { DropFactory } from "../../src/DropFactory.sol";
import { MerkleDrop } from "../../src/MerkleDrop.sol";
import { MockIdentityRegistry } from "../mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "../mocks/MockRegistryFactory.sol";
import { MerkleTestBase } from "../util/MerkleTestBase.sol";

/// @notice Drives random claims (and, once past the deadline, a sweep) against a
///         fixed 4-leaf native drop and tracks how much ETH has left the drop,
///         so the invariant test can assert conservation over arbitrary orderings.
contract NativeDropHandler is MerkleTestBase {
    address internal constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    DropFactory public factory;
    MerkleDrop public drop;
    address public operator;
    uint64 public deadline;

    uint256 public constant LEAVES = 4;
    uint256 public constant TOTAL = 10 ether;

    address[LEAVES] public owners;
    uint256[LEAVES] public amounts;
    mapping(uint256 => bytes32[]) internal _proofs;

    /// @notice ETH paid to claimers, and ETH swept to the operator (ghost variables).
    uint256 public ghostPaid;
    uint256 public ghostSwept;

    constructor(DropFactory factory_, address operator_, uint64 startTime, uint64 deadline_) {
        factory = factory_;
        operator = operator_;
        deadline = deadline_;

        amounts[0] = 1 ether;
        amounts[1] = 2 ether;
        amounts[2] = 3 ether;
        amounts[3] = 1 ether; // sum 7 ETH < TOTAL 10 ETH (remainder stays in the drop)
        for (uint256 i = 0; i < LEAVES; i++) {
            owners[i] = makeAddr(string(abi.encodePacked("owner", vm.toString(i))));
        }

        bytes32 root = _buildTree();

        uint256 fee = factory.feeOf(NATIVE, TOTAL);
        vm.deal(operator_, TOTAL + fee);
        vm.prank(operator_);
        drop = MerkleDrop(payable(_deploy(root, fee, startTime, deadline_)));
    }

    /// @dev Build the 4-leaf balanced tree, store each leaf's sibling proof, return the root.
    function _buildTree() private returns (bytes32 root) {
        bytes32 l0 = _leaf(0, owners[0], amounts[0]);
        bytes32 l1 = _leaf(1, owners[1], amounts[1]);
        bytes32 l2 = _leaf(2, owners[2], amounts[2]);
        bytes32 l3 = _leaf(3, owners[3], amounts[3]);
        bytes32 n01 = _hashPair(l0, l1);
        bytes32 n23 = _hashPair(l2, l3);

        _proofs[0] = _pair(l1, n23);
        _proofs[1] = _pair(l0, n23);
        _proofs[2] = _pair(l3, n01);
        _proofs[3] = _pair(l2, n01);

        return _hashPair(n01, n23);
    }

    function _deploy(bytes32 root, uint256 fee, uint64 startTime, uint64 deadline_)
        private
        returns (address)
    {
        return factory.createDrop{ value: TOTAL + fee }(
            uint8(DropFactory.AirdropType.CSV), NATIVE, root, TOTAL, startTime, deadline_, address(0)
        );
    }

    /// @notice Fuzz entrypoint: claim a (pseudo-random) still-unclaimed leaf while
    ///         the window is open. No-ops otherwise so it never wastes a revert.
    function claim(uint256 seed) external {
        if (block.timestamp > deadline) return;
        uint256 idx = seed % LEAVES;
        if (drop.isClaimed(idx)) return;
        vm.prank(owners[idx]);
        drop.claim(idx, owners[idx], amounts[idx], _proofs[idx]);
        ghostPaid += amounts[idx];
    }

    /// @notice Fuzz entrypoint: advance time gradually so the fuzzer explores
    ///         claim/sweep interleavings across the window (rather than jumping
    ///         straight to the deadline, which would no-op every later claim).
    function warpTime(uint256 amount) external {
        vm.warp(block.timestamp + (amount % 2 days));
    }

    /// @notice Fuzz entrypoint: once time has actually passed the deadline, the
    ///         operator sweeps the remainder — exercising the post-claim
    ///         conservation surface, not just claims.
    function sweep() external {
        if (block.timestamp <= deadline) return;
        uint256 remaining = address(drop).balance;
        if (remaining == 0) return;
        vm.prank(operator);
        drop.sweep();
        ghostSwept += remaining;
    }

    function _pair(bytes32 a, bytes32 b) private pure returns (bytes32[] memory p) {
        p = new bytes32[](2);
        p[0] = a;
        p[1] = b;
    }
}

/// @notice Stateful invariants for the native-ETH drop: no sequence of claims can
///         break ETH conservation or let the fee vault drift from the factory's
///         ETH balance.
contract NativeDropInvariantTest is Test {
    address internal constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    DropFactory internal factory;
    MockIdentityRegistry internal opReg;
    MockRegistryFactory internal zkFactory;
    NativeDropHandler internal handler;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal treasury = makeAddr("treasury");

    uint256 internal fee;

    function setUp() public {
        opReg = new MockIdentityRegistry();
        zkFactory = new MockRegistryFactory();
        factory = new DropFactory(admin, address(opReg), zkFactory, treasury);

        vm.prank(admin);
        factory.setAllowedToken(NATIVE, true);
        opReg.setVerifiedUntil(operator, uint64(block.timestamp + 365 days));

        handler = new NativeDropHandler(
            factory, operator, uint64(block.timestamp), uint64(block.timestamp + 7 days)
        );
        fee = factory.feeOf(NATIVE, handler.TOTAL());

        targetContract(address(handler));
    }

    /// @dev Claimed + swept ETH plus the drop's remaining balance always equals the funded total.
    function invariant_ethConservation() public view {
        assertEq(
            handler.ghostPaid() + handler.ghostSwept() + address(handler.drop()).balance,
            handler.TOTAL(),
            "claimed + swept + remaining == funded total"
        );
    }

    /// @dev The factory's entire ETH balance is exactly the accrued native fee —
    ///      claims and the drop never touch the fee vault.
    function invariant_feeVaultMatchesBalance() public view {
        assertEq(factory.collectedFees(NATIVE), fee, "fee accounting stable");
        assertEq(address(factory).balance, fee, "factory ETH == accrued fee");
    }
}
