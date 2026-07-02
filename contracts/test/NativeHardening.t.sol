// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { DropFactory } from "../src/DropFactory.sol";
import { MerkleDrop } from "../src/MerkleDrop.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockIdentityRegistry } from "./mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "./mocks/MockRegistryFactory.sol";
import { ReentrantEthClaimer } from "./mocks/ReentrantEthClaimer.sol";
import { MerkleTestBase } from "./util/MerkleTestBase.sol";

/// @notice Adversarial hardening for the native-ETH path (PR #55): reentrancy on
///         claim/sweep, the `receive()` ETH-acceptance guard, ETH-fee/balance
///         conservation, and a native-vs-ERC20 claim gas snapshot.
contract NativeHardeningTest is MerkleTestBase {
    DropFactory internal factory;
    MockIdentityRegistry internal opReg;
    MockRegistryFactory internal zkFactory;
    MockERC20 internal erc20;

    address internal constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal treasury = makeAddr("treasury");

    uint8 internal constant CSV = uint8(DropFactory.AirdropType.CSV);
    uint256 internal constant TOTAL = 10 ether;
    uint256 internal constant AMT0 = 3 ether;
    uint256 internal constant AMT1 = 4 ether;

    /// @dev The revert every reentrant attempt must produce — proving `nonReentrant`
    ///      (not an incidental `AlreadyClaimed`/zero-balance no-op) is what fired.
    bytes4 internal REENTRANT = ReentrancyGuard.ReentrancyGuardReentrantCall.selector;

    uint64 internal startTime;
    uint64 internal deadline;

    function setUp() public {
        opReg = new MockIdentityRegistry();
        zkFactory = new MockRegistryFactory();
        factory = _deployFactory(admin, address(opReg), zkFactory, treasury);
        erc20 = new MockERC20("Mock", "MOCK", 18);

        vm.startPrank(admin);
        factory.setAllowedToken(NATIVE, true);
        factory.setAllowedToken(address(erc20), true);
        vm.stopPrank();

        opReg.setVerifiedUntil(operator, uint64(block.timestamp + 365 days));

        startTime = uint64(block.timestamp);
        deadline = uint64(block.timestamp + 7 days);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /// @dev Two-leaf native drop, both leaves owned by `owner` (indices 0 and 1).
    ///      Returns the drop plus the sibling-proof for each leaf.
    function _twoLeafNative(address owner)
        internal
        returns (MerkleDrop drop, bytes32[] memory proof0, bytes32[] memory proof1)
    {
        bytes32 leaf0 = _leaf(0, owner, AMT0);
        bytes32 leaf1 = _leaf(1, owner, AMT1);
        bytes32 root = _hashPair(leaf0, leaf1);

        proof0 = new bytes32[](1);
        proof0[0] = leaf1;
        proof1 = new bytes32[](1);
        proof1[0] = leaf0;

        uint256 fee = factory.feeOf(NATIVE, TOTAL);
        uint256 value = TOTAL + fee;
        vm.deal(operator, value);
        vm.prank(operator);
        address deployed =
            factory.createDrop{ value: value }(CSV, NATIVE, root, TOTAL, startTime, deadline, address(0));
        drop = MerkleDrop(payable(deployed));
    }

    /// @dev Single-leaf ERC20 drop for `claimer` at index 0 (open gate).
    function _singleLeafErc20(address claimer, uint256 amount) internal returns (MerkleDrop drop) {
        bytes32 root = _leaf(0, claimer, amount);
        uint256 fee = factory.feeOf(address(erc20), TOTAL);
        erc20.mint(operator, TOTAL + fee);
        vm.startPrank(operator);
        erc20.approve(address(factory), TOTAL + fee);
        address deployed =
            factory.createDrop(CSV, address(erc20), root, TOTAL, startTime, deadline, address(0));
        vm.stopPrank();
        drop = MerkleDrop(payable(deployed));
    }

    // ------------------------------------------------------------------
    // 1. Adversarial reentrancy
    // ------------------------------------------------------------------

    /// @dev Reentering claim() with a *second* valid leaf during the ETH callback
    ///      must be blocked by nonReentrant — the attacker cannot chain-drain its
    ///      other allocation inside one transfer.
    function test_reentrancy_claimOtherLeafBlocked() public {
        ReentrantEthClaimer attacker = new ReentrantEthClaimer();
        (MerkleDrop drop, bytes32[] memory proof0, bytes32[] memory proof1) =
            _twoLeafNative(address(attacker));
        attacker.setDrop(drop);

        attacker.arm(ReentrantEthClaimer.Attack.CLAIM, 0, AMT0, proof0);
        attacker.armReentry(1, AMT1, proof1); // reenter the *sibling* leaf

        attacker.claim();

        assertTrue(attacker.reentryReverted(), "cross-index reentry must revert");
        assertEq(attacker.reentryReason(), REENTRANT, "blocked by nonReentrant, not another guard");
        assertEq(attacker.received(), 1, "paid exactly once");
        assertEq(address(attacker).balance, AMT0, "only first leaf paid");
        assertEq(address(drop).balance, TOTAL - AMT0, "drop debited once");
        assertTrue(drop.isClaimed(0), "leaf 0 claimed");
        assertFalse(drop.isClaimed(1), "leaf 1 NOT claimed via reentry");

        // The second allocation is still claimable in a fresh transaction.
        attacker.arm(ReentrantEthClaimer.Attack.NONE, 1, AMT1, proof1);
        attacker.claim();
        assertEq(address(attacker).balance, AMT0 + AMT1, "leaf 1 claimable normally");
    }

    /// @dev Reentering claim() with the *same* leaf must also revert (nonReentrant
    ///      fires before the CEI AlreadyClaimed guard is even reached).
    function test_reentrancy_claimSameLeafBlocked() public {
        ReentrantEthClaimer attacker = new ReentrantEthClaimer();
        (MerkleDrop drop, bytes32[] memory proof0,) = _twoLeafNative(address(attacker));
        attacker.setDrop(drop);

        attacker.arm(ReentrantEthClaimer.Attack.CLAIM, 0, AMT0, proof0);
        attacker.armReentry(0, AMT0, proof0); // reenter the *same* leaf
        attacker.claim();

        assertTrue(attacker.reentryReverted(), "same-index reentry must revert");
        // Without nonReentrant this would still revert (CEI => AlreadyClaimed); pinning the
        // selector proves the *guard* fired first, so the test is sensitive to its removal.
        assertEq(attacker.reentryReason(), REENTRANT, "blocked by nonReentrant, not CEI AlreadyClaimed");
        assertEq(address(attacker).balance, AMT0, "paid once, not twice");
        assertEq(address(drop).balance, TOTAL - AMT0, "drop debited once");
    }

    /// @dev A malicious *operator* sweeping after the deadline cannot reenter
    ///      sweep() to double-drain — nonReentrant blocks the callback.
    function test_reentrancy_sweepBlocked() public {
        ReentrantEthClaimer attackerOp = new ReentrantEthClaimer();
        opReg.setVerifiedUntil(address(attackerOp), uint64(block.timestamp + 365 days));

        bytes32 root = _leaf(0, address(attackerOp), AMT0); // nonzero root; no claims needed
        uint256 fee = factory.feeOf(NATIVE, TOTAL);
        // The test contract forwards the funding as msg.value; the attacker starts at 0 ETH,
        // so its post-sweep balance is exactly what it reclaims.
        vm.deal(address(this), TOTAL + fee);
        attackerOp.createNative{ value: TOTAL + fee }(factory, root, TOTAL, startTime, deadline);

        attackerOp.arm(ReentrantEthClaimer.Attack.SWEEP, 0, AMT0, new bytes32[](0));

        vm.warp(deadline + 1);
        attackerOp.sweep();

        assertTrue(attackerOp.reentryReverted(), "sweep reentry must revert");
        assertEq(attackerOp.reentryReason(), REENTRANT, "blocked by nonReentrant on the sweep path");
        assertEq(attackerOp.received(), 1, "swept once");
        assertEq(address(attackerOp).balance, TOTAL, "reclaimed exactly the funded total");
        assertEq(address(attackerOp.drop()).balance, 0, "drop fully swept, not over-drained");
    }

    // ------------------------------------------------------------------
    // 2. receive() ETH-acceptance guard
    // ------------------------------------------------------------------

    /// @dev An ERC20 drop must reject direct ETH so funds cannot get stuck
    ///      (its sweep only moves the token balance).
    function test_receive_erc20DropRejectsEth() public {
        MerkleDrop drop = _singleLeafErc20(makeAddr("erc20claimer"), AMT0);

        vm.deal(address(this), 1 ether);
        (bool ok, bytes memory ret) = address(drop).call{ value: 1 ether }("");
        assertFalse(ok, "ERC20 drop must reject ETH");
        assertEq(bytes4(ret), MerkleDrop.EthNotAccepted.selector, "reverts EthNotAccepted");
        assertEq(address(drop).balance, 0, "no ETH stuck");
    }

    /// @dev A native drop accepts direct ETH (this is how the factory funds it).
    function test_receive_nativeDropAcceptsEth() public {
        (MerkleDrop drop,,) = _twoLeafNative(makeAddr("nativeClaimer"));
        uint256 before = address(drop).balance;

        vm.deal(address(this), 1 ether);
        (bool ok,) = address(drop).call{ value: 1 ether }("");
        assertTrue(ok, "native drop accepts ETH");
        assertEq(address(drop).balance, before + 1 ether, "ETH credited");
    }

    // ------------------------------------------------------------------
    // 3. Conservation of value (ETH)
    // ------------------------------------------------------------------

    /// @dev Across claims + sweep, distributed + remaining ETH always equals the
    ///      funded total, and the factory's ETH balance equals the accrued fee.
    function test_conservation_nativeClaimsAndSweep() public {
        address owner = makeAddr("conserver");
        (MerkleDrop drop, bytes32[] memory proof0, bytes32[] memory proof1) = _twoLeafNative(owner);
        uint256 fee = factory.feeOf(NATIVE, TOTAL);

        // Fee vault invariant holds immediately after creation.
        assertEq(factory.collectedFees(NATIVE), fee, "fee accrued");
        assertEq(address(factory).balance, fee, "factory ETH == accrued fee");

        vm.prank(owner);
        drop.claim(0, owner, AMT0, proof0);
        vm.prank(owner);
        drop.claim(1, owner, AMT1, proof1);

        // Distributed + remaining == funded total.
        assertEq(owner.balance, AMT0 + AMT1, "owner received both");
        assertEq(address(drop).balance, TOTAL - AMT0 - AMT1, "remainder held");
        assertEq(owner.balance + address(drop).balance, TOTAL, "conservation before sweep");

        vm.warp(deadline + 1);
        vm.prank(operator);
        drop.sweep();

        assertEq(address(drop).balance, 0, "drop emptied");
        assertEq(owner.balance + operator.balance, TOTAL, "conservation after sweep");
        // Fee vault untouched by claims/sweep.
        assertEq(address(factory).balance, fee, "factory still holds only the fee");
    }

    // ------------------------------------------------------------------
    // 4. Gas snapshot: native vs ERC20 claim
    // ------------------------------------------------------------------

    /// @dev Informational: logs the gas cost of a native claim vs an ERC20 claim.
    function test_gas_nativeVsErc20Claim() public {
        // Native claim.
        address nClaimer = makeAddr("gasNative");
        bytes32 nRoot = _leaf(0, nClaimer, AMT0);
        uint256 nFee = factory.feeOf(NATIVE, TOTAL);
        vm.deal(operator, TOTAL + nFee);
        vm.prank(operator);
        MerkleDrop nDrop = MerkleDrop(
            payable(factory.createDrop{ value: TOTAL + nFee }(
                    CSV, NATIVE, nRoot, TOTAL, startTime, deadline, address(0)
                ))
        );
        vm.prank(nClaimer);
        uint256 g0 = gasleft();
        nDrop.claim(0, nClaimer, AMT0, new bytes32[](0));
        uint256 nativeGas = g0 - gasleft();

        // ERC20 claim.
        address eClaimer = makeAddr("gasErc20");
        MerkleDrop eDrop = _singleLeafErc20(eClaimer, AMT0);
        vm.prank(eClaimer);
        uint256 g1 = gasleft();
        eDrop.claim(0, eClaimer, AMT0, new bytes32[](0));
        uint256 erc20Gas = g1 - gasleft();

        emit log_named_uint("native  claim gas", nativeGas);
        emit log_named_uint("erc20   claim gas", erc20Gas);
    }
}
