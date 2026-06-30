// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";

import { ERC20 } from "solmate/tokens/ERC20.sol";

import { MerkleDrop } from "../src/MerkleDrop.sol";
import { IIdentityRegistry } from "../src/interfaces/IIdentityRegistry.sol";

import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockIdentityRegistry } from "./mocks/MockIdentityRegistry.sol";

/// @notice Unit + fuzz tests for MerkleDrop.
/// @dev The 4-leaf Merkle tree is rebuilt in `setUp` from the agreed scheme —
///      leaf = `keccak256(abi.encodePacked(index, account, amount))`, internal
///      nodes via sorted-pair keccak — the same algorithm `packages/merkle`
///      implements. This derivation is independent of OpenZeppelin's verifier,
///      so a passing `claim` confirms the contract's on-chain leaf encoding
///      agrees with that scheme. `EXPECTED_ROOT` pins the exact bytes as a
///      known-answer check, so any drift in encoding or hashing fails loudly.
contract MerkleDropTest is Test {
    MockERC20 internal token;
    MockIdentityRegistry internal registry;
    MerkleDrop internal drop;

    address internal constant OPERATOR = address(0xBEEF);

    // --- 4-leaf allocation vector (index, account, amount) ---
    address internal constant ACC0 = address(0xA11);
    address internal constant ACC1 = address(0xB22);
    address internal constant ACC2 = address(0xC33);
    address internal constant ACC3 = address(0xD44);
    uint256 internal constant AMT0 = 100;
    uint256 internal constant AMT1 = 200;
    uint256 internal constant AMT2 = 300;
    uint256 internal constant AMT3 = 400;
    uint256 internal constant TOTAL = AMT0 + AMT1 + AMT2 + AMT3;

    /// @dev Known-answer root for the vector above (pins exact encoding bytes).
    bytes32 internal constant EXPECTED_ROOT =
        0x2b1d9887b321e5163624cc8f2ea2a0fb04c7f131bee3cd75030cf66cc105efa3;

    uint64 internal deadline;
    bytes32 internal root;
    bytes32[] internal proof0; // inclusion proof for leaf index 0

    event Claimed(uint256 indexed index, address indexed account, uint256 amount);
    event Swept(address indexed to, uint256 amount);

    function setUp() public {
        // Anchor time so deadline math is unambiguous.
        vm.warp(1_000_000);
        deadline = uint64(block.timestamp + 30 days);

        // Rebuild the tree with the agreed leaf encoding + sorted-pair hashing.
        bytes32 l0 = _leaf(0, ACC0, AMT0);
        bytes32 l1 = _leaf(1, ACC1, AMT1);
        bytes32 l2 = _leaf(2, ACC2, AMT2);
        bytes32 l3 = _leaf(3, ACC3, AMT3);
        bytes32 n01 = _hashPair(l0, l1);
        bytes32 n23 = _hashPair(l2, l3);
        root = _hashPair(n01, n23);
        proof0 = [l1, n23];

        token = new MockERC20("Drop", "DRP", 18);
        registry = new MockIdentityRegistry();
        drop = new MerkleDrop(
            ERC20(address(token)), root, deadline, IIdentityRegistry(address(registry)), OPERATOR
        );

        // Fund the drop with exactly the total allocation.
        token.mint(address(drop), TOTAL);

        // Only ACC0 reaches the verification gate in these tests.
        registry.setVerifiedUntil(ACC0, type(uint64).max);
    }

    function _leaf(uint256 index, address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(index, account, amount));
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_SetsImmutables() public view {
        assertEq(drop.factory(), address(this));
        assertEq(address(drop.token()), address(token));
        assertEq(drop.merkleRoot(), root);
        assertEq(drop.deadline(), deadline);
        assertEq(address(drop.identityRegistry()), address(registry));
        assertEq(drop.operator(), OPERATOR);
    }

    function test_Constructor_RevertZeroToken() public {
        vm.expectRevert(MerkleDrop.ZeroAddress.selector);
        new MerkleDrop(ERC20(address(0)), root, deadline, IIdentityRegistry(address(registry)), OPERATOR);
    }

    function test_Constructor_RevertZeroRegistry() public {
        vm.expectRevert(MerkleDrop.ZeroAddress.selector);
        new MerkleDrop(ERC20(address(token)), root, deadline, IIdentityRegistry(address(0)), OPERATOR);
    }

    function test_Constructor_RevertZeroOperator() public {
        vm.expectRevert(MerkleDrop.ZeroAddress.selector);
        new MerkleDrop(
            ERC20(address(token)), root, deadline, IIdentityRegistry(address(registry)), address(0)
        );
    }

    function test_Constructor_RevertDeadlineInPast() public {
        vm.expectRevert(MerkleDrop.DeadlineInPast.selector);
        new MerkleDrop(
            ERC20(address(token)),
            root,
            uint64(block.timestamp),
            IIdentityRegistry(address(registry)),
            OPERATOR
        );
    }

    /*//////////////////////////////////////////////////////////////
                                 CLAIM
    //////////////////////////////////////////////////////////////*/

    function test_Claim_Success() public {
        vm.expectEmit(true, true, false, true, address(drop));
        emit Claimed(0, ACC0, AMT0);

        vm.prank(ACC0);
        drop.claim(0, ACC0, AMT0, proof0);

        assertEq(token.balanceOf(ACC0), AMT0);
        assertEq(token.balanceOf(address(drop)), TOTAL - AMT0);
        assertTrue(drop.isClaimed(0));
    }

    /// @dev Known-answer check: the tree rebuilt from the agreed leaf encoding +
    ///      sorted-pair hashing must hash to the pinned root, locking the exact
    ///      bytes so any encoding/hashing drift fails here.
    function test_MerkleVector_MatchesPinnedRoot() public view {
        assertEq(root, EXPECTED_ROOT);
        assertEq(drop.merkleRoot(), EXPECTED_ROOT);
    }

    function test_Claim_VerifiedExactlyAtNow() public {
        // verifiedUntil == block.timestamp must pass (>=).
        registry.setVerifiedUntil(ACC0, uint64(block.timestamp));
        vm.prank(ACC0);
        drop.claim(0, ACC0, AMT0, proof0);
        assertTrue(drop.isClaimed(0));
    }

    function test_Claim_RevertWhenClosed() public {
        vm.warp(deadline + 1);
        vm.prank(ACC0);
        vm.expectRevert(MerkleDrop.ClaimClosed.selector);
        drop.claim(0, ACC0, AMT0, proof0);
    }

    function test_Claim_RevertNotSelfClaim() public {
        // Caller is ACC1 but claims ACC0's allocation.
        vm.prank(ACC1);
        vm.expectRevert(MerkleDrop.NotSelfClaim.selector);
        drop.claim(0, ACC0, AMT0, proof0);
    }

    function test_Claim_RevertNotVerified() public {
        registry.setVerifiedUntil(ACC0, 0);
        vm.prank(ACC0);
        vm.expectRevert(MerkleDrop.NotVerified.selector);
        drop.claim(0, ACC0, AMT0, proof0);
    }

    function test_Claim_RevertVerificationExpired() public {
        registry.setVerifiedUntil(ACC0, uint64(block.timestamp - 1));
        vm.prank(ACC0);
        vm.expectRevert(MerkleDrop.NotVerified.selector);
        drop.claim(0, ACC0, AMT0, proof0);
    }

    function test_Claim_RevertAlreadyClaimed() public {
        vm.prank(ACC0);
        drop.claim(0, ACC0, AMT0, proof0);

        vm.prank(ACC0);
        vm.expectRevert(MerkleDrop.AlreadyClaimed.selector);
        drop.claim(0, ACC0, AMT0, proof0);
    }

    function test_Claim_RevertWrongAmount() public {
        vm.prank(ACC0);
        vm.expectRevert(MerkleDrop.InvalidProof.selector);
        drop.claim(0, ACC0, AMT0 + 1, proof0);
    }

    function test_Claim_RevertWrongProof() public {
        bytes32[] memory bad = proof0;
        bad[0] = bytes32(0);
        vm.prank(ACC0);
        vm.expectRevert(MerkleDrop.InvalidProof.selector);
        drop.claim(0, ACC0, AMT0, bad);
    }

    /// @dev Fuzz: no amount other than the committed one ever verifies.
    function testFuzz_Claim_RevertWrongAmount(uint256 amount) public {
        vm.assume(amount != AMT0);
        vm.prank(ACC0);
        vm.expectRevert(MerkleDrop.InvalidProof.selector);
        drop.claim(0, ACC0, amount, proof0);
    }

    /*//////////////////////////////////////////////////////////////
                                 SWEEP
    //////////////////////////////////////////////////////////////*/

    function test_Sweep_Success() public {
        // One claim happens, then operator sweeps the rest after the deadline.
        vm.prank(ACC0);
        drop.claim(0, ACC0, AMT0, proof0);

        vm.warp(deadline + 1);

        uint256 remaining = TOTAL - AMT0;
        vm.expectEmit(true, false, false, true, address(drop));
        emit Swept(OPERATOR, remaining);

        vm.prank(OPERATOR);
        drop.sweep();

        assertEq(token.balanceOf(OPERATOR), remaining);
        assertEq(token.balanceOf(address(drop)), 0);
    }

    function test_Sweep_RevertNotOperator() public {
        vm.warp(deadline + 1);
        vm.prank(ACC0);
        vm.expectRevert(MerkleDrop.NotOperator.selector);
        drop.sweep();
    }

    function test_Sweep_RevertTooEarly() public {
        vm.prank(OPERATOR);
        vm.expectRevert(MerkleDrop.SweepTooEarly.selector);
        drop.sweep();
    }

    function test_Sweep_AtDeadlineStillTooEarly() public {
        vm.warp(deadline);
        vm.prank(OPERATOR);
        vm.expectRevert(MerkleDrop.SweepTooEarly.selector);
        drop.sweep();
    }
}
