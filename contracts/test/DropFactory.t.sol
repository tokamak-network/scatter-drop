// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MerkleTestBase } from "./util/MerkleTestBase.sol";
import { Ownable } from "solady/auth/Ownable.sol";

import { DropFactory } from "../src/DropFactory.sol";
import { MerkleDrop } from "../src/MerkleDrop.sol";
import { IRegistryFactoryLike } from "../src/interfaces/IRegistryFactoryLike.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockIdentityRegistry } from "./mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "./mocks/MockRegistryFactory.sol";
import { MockFeeOnTransferERC20 } from "./mocks/MockFeeOnTransferERC20.sol";

contract DropFactoryTest is MerkleTestBase {
    DropFactory internal factory;
    MockERC20 internal airdropToken;
    MockIdentityRegistry internal opReg;
    MockRegistryFactory internal zkFactory;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal treasury = makeAddr("treasury");
    address internal custReg = makeAddr("custReg");

    bytes32 internal constant ROOT = keccak256("root");
    uint256 internal constant TOTAL = 1_000 ether;
    uint16 internal constant DEFAULT_BPS = 50; // 0.5%

    uint64 internal startTime;
    uint64 internal deadline;

    event AllowedTokenSet(address indexed token, bool allowed, address indexed caller);

    function setUp() public {
        airdropToken = new MockERC20("Drop", "DROP", 18);
        opReg = new MockIdentityRegistry();
        zkFactory = new MockRegistryFactory();
        zkFactory.setRegistry(custReg, true);

        factory = _deployFactory(admin, address(opReg), zkFactory, treasury);

        vm.prank(admin);
        factory.setAllowedToken(address(airdropToken), true); // curate the airdrop token

        startTime = uint64(block.timestamp); // claims open immediately
        deadline = uint64(block.timestamp + 7 days);
    }

    // -- helpers ---------------------------------------------------------

    function _verifyOperator(address who) internal {
        opReg.setVerifiedUntil(who, uint64(block.timestamp + 365 days));
    }

    function _expectedFee(uint256 total) internal view returns (uint256) {
        return factory.feeOf(address(airdropToken), total);
    }

    /// @dev Fund `who` with `total + fee` of the airdrop token and approve the factory.
    function _fund(address who, uint256 total) internal {
        uint256 fee = _expectedFee(total);
        airdropToken.mint(who, total + fee);
        vm.prank(who);
        airdropToken.approve(address(factory), total + fee);
    }

    function _create(uint8 airdropType, address who) internal returns (address drop) {
        vm.prank(who);
        drop =
            factory.createDrop(airdropType, address(airdropToken), ROOT, TOTAL, startTime, deadline, custReg);
    }

    function _createCsv(address who) internal returns (address drop) {
        return _create(uint8(DropFactory.AirdropType.CSV), who);
    }

    // -- createDrop: happy path (PERCENT default) ------------------------

    function test_createDrop_wiresDropAndChargesPercentFee() public {
        _verifyOperator(operator);
        _fund(operator, TOTAL);
        uint256 fee = _expectedFee(TOTAL);
        assertEq(fee, TOTAL * DEFAULT_BPS / 10_000, "0.5% fee");

        address drop = _createCsv(operator);

        MerkleDrop md = MerkleDrop(payable(drop));
        assertEq(md.factory(), address(factory), "factory");
        assertEq(address(md.token()), address(airdropToken), "token");
        assertEq(md.operator(), operator, "operator");
        assertEq(md.startTime(), startTime, "startTime");
        assertEq(md.deadline(), deadline, "deadline");

        assertEq(airdropToken.balanceOf(drop), TOTAL, "drop funded with full total");
        assertEq(airdropToken.balanceOf(address(factory)), fee, "vault holds fee on top");
        assertEq(airdropToken.balanceOf(operator), 0, "operator paid total + fee");
        assertEq(factory.collectedFees(address(airdropToken)), fee, "collected accounting");

        assertEq(factory.dropsLength(), 1);
        assertEq(factory.dropAt(0), drop);
        assertEq(factory.allDrops()[0], drop);
    }

    function test_createDrop_revertsWhenEthSentForErc20() public {
        // ERC20 drops carry no msg.value; stray ETH would otherwise be stuck.
        _verifyOperator(operator);
        _fund(operator, TOTAL);
        vm.deal(operator, 1 ether);
        vm.prank(operator);
        vm.expectRevert(DropFactory.IncorrectValue.selector);
        factory.createDrop{ value: 1 }(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, startTime, deadline, custReg
        );
    }

    function test_createDrop_emitsDropCreated() public {
        _verifyOperator(operator);
        _fund(operator, TOTAL);
        uint256 fee = _expectedFee(TOTAL);

        vm.expectEmit(false, true, true, true, address(factory));
        emit DropFactory.DropCreated(
            address(0),
            operator,
            DropFactory.AirdropType.CSV,
            address(airdropToken),
            custReg,
            ROOT,
            TOTAL,
            startTime,
            deadline,
            fee
        );
        _createCsv(operator);
    }

    function test_createDrop_flatFee() public {
        uint256 flat = 7 ether;
        vm.startPrank(admin);
        factory.setFeeMode(address(airdropToken), DropFactory.FeeMode.FLAT);
        factory.setFlatFee(address(airdropToken), flat);
        vm.stopPrank();

        _verifyOperator(operator);
        _fund(operator, TOTAL); // _expectedFee now returns the flat fee
        address drop = _createCsv(operator);

        assertEq(airdropToken.balanceOf(drop), TOTAL);
        assertEq(factory.collectedFees(address(airdropToken)), flat);
    }

    function test_createDrop_flatFee_revertsWhenUnset() public {
        vm.prank(admin);
        factory.setFeeMode(address(airdropToken), DropFactory.FeeMode.FLAT); // flatFee stays 0
        _verifyOperator(operator);
        airdropToken.mint(operator, TOTAL);
        vm.prank(operator);
        airdropToken.approve(address(factory), TOTAL);

        vm.prank(operator);
        vm.expectRevert(DropFactory.FeeNotConfigured.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            startTime,
            deadline,
            custReg
        );
    }

    function test_createDrop_percentZeroFee() public {
        // Admin can waive the percentage fee (0 bps) — fee is 0, no vault pull, no FeeNotConfigured.
        vm.prank(admin);
        factory.setFeeBps(address(airdropToken), 0);

        _verifyOperator(operator);
        airdropToken.mint(operator, TOTAL);
        vm.prank(operator);
        airdropToken.approve(address(factory), TOTAL);

        address drop = _createCsv(operator);
        assertEq(airdropToken.balanceOf(drop), TOTAL);
        assertEq(factory.collectedFees(address(airdropToken)), 0);
    }

    function test_createDrop_percentDustRoundsToZero() public {
        // Tiny total: total*bps/10000 floors to 0 — allowed (PERCENT), not FeeNotConfigured.
        uint256 tiny = 100; // 100 * 50 / 10000 = 0
        assertEq(_expectedFee(tiny), 0);
        _verifyOperator(operator);
        airdropToken.mint(operator, tiny);
        vm.prank(operator);
        airdropToken.approve(address(factory), tiny);
        vm.prank(operator);
        address drop = factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            tiny,
            startTime,
            deadline,
            custReg
        );
        assertEq(airdropToken.balanceOf(drop), tiny);
        assertEq(factory.collectedFees(address(airdropToken)), 0);
    }

    // -- createDrop: gate 1 ----------------------------------------------

    function test_createDrop_revertsWhenOperatorUnverified() public {
        _fund(operator, TOTAL);
        vm.prank(operator);
        vm.expectRevert(DropFactory.OperatorNotVerified.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            startTime,
            deadline,
            custReg
        );
    }

    function test_createDrop_succeedsWhenVerifiedUntilEqualsNow() public {
        opReg.setVerifiedUntil(operator, uint64(block.timestamp));
        _fund(operator, TOTAL);
        assertTrue(_createCsv(operator) != address(0));
    }

    // -- createDrop: registry / allow-list -------------------------------

    function test_createDrop_revertsWhenRegistryNotStandard() public {
        _verifyOperator(operator);
        _fund(operator, TOTAL);
        vm.prank(operator);
        vm.expectRevert(DropFactory.NotAStandardRegistry.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            startTime,
            deadline,
            makeAddr("fakeReg")
        );
    }

    function test_createDrop_revertsWhenTokenNotAllowed() public {
        MockERC20 unlisted = new MockERC20("U", "U", 18);
        _verifyOperator(operator);
        unlisted.mint(operator, TOTAL);
        vm.prank(operator);
        unlisted.approve(address(factory), TOTAL);
        vm.prank(operator);
        vm.expectRevert(DropFactory.TokenNotAllowed.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(unlisted), ROOT, TOTAL, startTime, deadline, custReg
        );
    }

    // -- createDrop: input / window validation ---------------------------

    function test_createDrop_revertsOnBadAirdropType() public {
        _verifyOperator(operator);
        _fund(operator, TOTAL);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidAirdropType.selector);
        factory.createDrop(4, address(airdropToken), ROOT, TOTAL, startTime, deadline, custReg);
    }

    function test_createDrop_revertsOnZeroToken() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(0), ROOT, TOTAL, startTime, deadline, custReg
        );
    }

    function test_createDrop_openGate_zeroRegistryAllowed() public {
        // W24: identityRegistry == address(0) is a valid "open claim" campaign.
        _verifyOperator(operator);
        _fund(operator, TOTAL);
        vm.prank(operator);
        address drop = factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            startTime,
            deadline,
            address(0)
        );
        assertEq(address(MerkleDrop(payable(drop)).identityRegistry()), address(0), "open gate");
        assertEq(airdropToken.balanceOf(drop), TOTAL, "funded");
    }

    function test_createDrop_revertsOnZeroRoot() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidMerkleRoot.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            bytes32(0),
            TOTAL,
            startTime,
            deadline,
            custReg
        );
    }

    function test_createDrop_revertsOnZeroTotal() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.ZeroTotalAmount.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, 0, startTime, deadline, custReg
        );
    }

    function test_createDrop_revertsOnPastDeadline() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidDeadline.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            startTime,
            uint64(block.timestamp),
            custReg
        );
    }

    function test_createDrop_revertsWhenStartAfterDeadline() public {
        _verifyOperator(operator);
        _fund(operator, TOTAL);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidWindow.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            deadline,
            deadline,
            custReg
        );
    }

    function test_createDrop_revertsWhenWindowBelowMinDuration() public {
        _verifyOperator(operator);
        _fund(operator, TOTAL);
        uint64 d = uint64(block.timestamp + factory.MIN_DURATION() - 1);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidWindow.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, startTime, d, custReg
        );
    }

    function test_createDrop_succeedsAtExactlyMinDuration() public {
        _verifyOperator(operator);
        _fund(operator, TOTAL);
        uint64 d = uint64(block.timestamp + factory.MIN_DURATION());
        vm.prank(operator);
        assertTrue(
            factory.createDrop(
                uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, startTime, d, custReg
            ) != address(0)
        );
    }

    function test_createDrop_revertsOnEoaAirdropToken() public {
        // An EOA can't be allow-listed (setAllowedToken requires a contract), so this reverts at the
        // allow-list gate. Use a disallowed contract token to hit the contract check first is N/A here.
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(0), ROOT, TOTAL, startTime, deadline, custReg
        );
    }

    function test_createDrop_revertsOnFeeOnTransferAirdropToken() public {
        MockFeeOnTransferERC20 fot = new MockFeeOnTransferERC20("Tax", "TAX", 100);
        vm.prank(admin);
        factory.setAllowedToken(address(fot), true);
        _verifyOperator(operator);
        fot.mint(operator, TOTAL * 2);
        vm.prank(operator);
        fot.approve(address(factory), TOTAL * 2);
        vm.prank(operator);
        vm.expectRevert(DropFactory.IncorrectAmountReceived.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(fot), ROOT, TOTAL, startTime, deadline, custReg
        );
    }

    // -- fee configuration -----------------------------------------------

    function test_feeOf_defaultsAndOverrides() public {
        assertEq(uint8(factory.feeModeOf(address(airdropToken))), uint8(DropFactory.FeeMode.PERCENT));
        assertEq(factory.feeBpsOf(address(airdropToken)), DEFAULT_BPS);
        assertEq(factory.feeOf(address(airdropToken), TOTAL), TOTAL * DEFAULT_BPS / 10_000);

        vm.startPrank(admin);
        factory.setFeeBps(address(airdropToken), 200); // 2%
        vm.stopPrank();
        assertEq(factory.feeBpsOf(address(airdropToken)), 200);
        assertEq(factory.feeOf(address(airdropToken), TOTAL), TOTAL * 200 / 10_000);
    }

    function test_defaults_takeEffectForUnconfiguredToken() public {
        MockERC20 other = new MockERC20("O", "O", 18);
        // unconfigured token uses the global defaults
        assertEq(uint8(factory.feeModeOf(address(other))), uint8(DropFactory.FeeMode.PERCENT));
        assertEq(factory.feeBpsOf(address(other)), DEFAULT_BPS);

        vm.startPrank(admin);
        factory.setDefaultFeeMode(DropFactory.FeeMode.FLAT);
        factory.setDefaultFeeBps(300);
        vm.stopPrank();
        assertEq(uint8(factory.defaultFeeMode()), uint8(DropFactory.FeeMode.FLAT));
        assertEq(factory.defaultFeeBps(), 300);
        // `other` now defaults to FLAT; feeOf reverts since its flat fee is unset
        vm.expectRevert(DropFactory.FeeNotConfigured.selector);
        factory.feeOf(address(other), TOTAL);
    }

    function test_setFeeBps_revertsAboveMax() public {
        vm.startPrank(admin);
        vm.expectRevert(DropFactory.FeeTooHigh.selector);
        factory.setFeeBps(address(airdropToken), 1001);
        vm.expectRevert(DropFactory.FeeTooHigh.selector);
        factory.setDefaultFeeBps(1001);
        vm.stopPrank();
    }

    function test_feeSetters_onlyOwner() public {
        bytes memory denied = abi.encodeWithSelector(Ownable.Unauthorized.selector);
        vm.startPrank(operator);
        vm.expectRevert(denied);
        factory.setDefaultFeeMode(DropFactory.FeeMode.FLAT);
        vm.expectRevert(denied);
        factory.setDefaultFeeBps(10);
        vm.expectRevert(denied);
        factory.setFeeMode(address(airdropToken), DropFactory.FeeMode.FLAT);
        vm.expectRevert(denied);
        factory.setFeeBps(address(airdropToken), 10);
        vm.expectRevert(denied);
        factory.setFlatFee(address(airdropToken), 1);
        vm.stopPrank();
    }

    // -- token allow-list ------------------------------------------------

    function test_setAllowedToken_allowAndDisallow() public {
        MockERC20 t = new MockERC20("T", "T", 18);
        vm.expectEmit(true, true, false, true, address(factory));
        emit AllowedTokenSet(address(t), true, admin);
        vm.prank(admin);
        factory.setAllowedToken(address(t), true);
        assertTrue(factory.isAllowed(address(t)));
        assertEq(uint8(factory.tokenTier(address(t))), uint8(DropFactory.TokenTier.ALLOWED));

        vm.expectEmit(true, true, false, true, address(factory));
        emit AllowedTokenSet(address(t), false, admin);
        vm.prank(admin);
        factory.setAllowedToken(address(t), false);
        assertFalse(factory.isAllowed(address(t)));
    }

    function test_setAllowedToken_onlyOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.Unauthorized.selector));
        factory.setAllowedToken(address(airdropToken), false);
    }

    function test_setAllowedToken_revertsOnEoa() public {
        vm.prank(admin);
        vm.expectRevert(DropFactory.NotAContract.selector);
        factory.setAllowedToken(makeAddr("eoa"), true);
    }

    function test_setAllowedToken_idempotent() public {
        MockERC20 t = new MockERC20("T", "T", 18);
        vm.startPrank(admin);
        factory.setAllowedToken(address(t), true);
        factory.setAllowedToken(address(t), true); // no-op
        assertTrue(factory.isAllowed(address(t)));
        factory.setAllowedToken(makeAddr("never"), false); // disallow an already-NONE token: no-op
        vm.stopPrank();
    }

    // -- admin: registries / treasury ------------------------------------

    function test_setters_onlyOwnerAndZeroAddress() public {
        bytes memory denied = abi.encodeWithSelector(Ownable.Unauthorized.selector);
        vm.startPrank(operator);
        vm.expectRevert(denied);
        factory.setOperatorRegistry(address(opReg));
        vm.expectRevert(denied);
        factory.setZkFactory(zkFactory);
        vm.expectRevert(denied);
        factory.setTreasury(treasury);
        vm.expectRevert(denied);
        factory.withdrawFees(address(airdropToken), 1);
        vm.stopPrank();

        vm.startPrank(admin);
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.setOperatorRegistry(address(0));
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.setZkFactory(IRegistryFactoryLike(address(0)));
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.setTreasury(address(0));
        vm.stopPrank();
    }

    function test_setRegistries_revertOnEoaAndTakeEffect() public {
        vm.startPrank(admin);
        vm.expectRevert(DropFactory.NotAContract.selector);
        factory.setOperatorRegistry(makeAddr("eoa"));
        vm.expectRevert(DropFactory.NotAContract.selector);
        factory.setZkFactory(IRegistryFactoryLike(makeAddr("eoa")));

        MockIdentityRegistry newReg = new MockIdentityRegistry();
        factory.setOperatorRegistry(address(newReg));
        MockRegistryFactory newZk = new MockRegistryFactory();
        factory.setZkFactory(newZk);
        vm.stopPrank();
        assertEq(factory.operatorRegistry(), address(newReg));
        assertEq(address(factory.zkFactory()), address(newZk));
    }

    // -- pause -----------------------------------------------------------

    function test_setPaused_onlyOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.Unauthorized.selector));
        factory.setPaused(true);
    }

    function test_createDrop_revertsWhenPaused() public {
        vm.prank(admin);
        factory.setPaused(true);
        assertTrue(factory.paused());

        _verifyOperator(operator);
        _fund(operator, TOTAL);
        vm.prank(operator);
        vm.expectRevert(DropFactory.ServicePaused.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, startTime, deadline, custReg
        );

        // Unpausing restores creation.
        vm.prank(admin);
        factory.setPaused(false);
        address drop = _createCsv(operator);
        assertTrue(drop != address(0));
        assertEq(factory.dropsLength(), 1);
    }

    // -- initialize ------------------------------------------------------
    // Validation moved from the constructor to initialize() (UUPS proxy). Each
    // deploys an uninitialized proxy, then asserts initialize reverts on bad args.

    function test_initialize_revertsOnZeroOperatorRegistry() public {
        DropFactory f = _deployFactoryProxy();
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        f.initialize(admin, address(0), zkFactory, treasury);
    }

    function test_initialize_revertsOnZeroZkFactory() public {
        DropFactory f = _deployFactoryProxy();
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        f.initialize(admin, address(opReg), IRegistryFactoryLike(address(0)), treasury);
    }

    function test_initialize_revertsOnZeroTreasury() public {
        DropFactory f = _deployFactoryProxy();
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        f.initialize(admin, address(opReg), zkFactory, address(0));
    }

    function test_initialize_revertsOnEoaOperatorRegistry() public {
        DropFactory f = _deployFactoryProxy();
        vm.expectRevert(DropFactory.NotAContract.selector);
        f.initialize(admin, makeAddr("eoa"), zkFactory, treasury);
    }

    function test_initialize_revertsOnEoaZkFactory() public {
        DropFactory f = _deployFactoryProxy();
        vm.expectRevert(DropFactory.NotAContract.selector);
        f.initialize(admin, address(opReg), IRegistryFactoryLike(makeAddr("eoa")), treasury);
    }

    // -- withdrawFees ----------------------------------------------------

    function test_withdrawFees_toTreasury() public {
        _verifyOperator(operator);
        _fund(operator, TOTAL);
        _createCsv(operator);
        uint256 fee = factory.collectedFees(address(airdropToken));

        vm.prank(admin);
        factory.withdrawFees(address(airdropToken), fee);
        assertEq(airdropToken.balanceOf(treasury), fee);
        assertEq(factory.collectedFees(address(airdropToken)), 0);
        assertEq(airdropToken.balanceOf(address(factory)), 0);
    }

    function test_withdrawFees_partialZeroAndOverdraw() public {
        _verifyOperator(operator);
        _fund(operator, TOTAL);
        _createCsv(operator);
        uint256 fee = factory.collectedFees(address(airdropToken));

        vm.startPrank(admin);
        factory.withdrawFees(address(airdropToken), 0); // no-op
        assertEq(factory.collectedFees(address(airdropToken)), fee);
        factory.withdrawFees(address(airdropToken), fee / 2);
        assertEq(factory.collectedFees(address(airdropToken)), fee - fee / 2);
        vm.expectRevert(DropFactory.InsufficientCollectedFees.selector);
        factory.withdrawFees(address(airdropToken), fee);
        vm.stopPrank();
    }

    function test_withdrawFees_honorsUpdatedTreasury() public {
        _verifyOperator(operator);
        _fund(operator, TOTAL);
        _createCsv(operator);
        uint256 fee = factory.collectedFees(address(airdropToken));
        address newTreasury = makeAddr("newTreasury");
        vm.startPrank(admin);
        factory.setTreasury(newTreasury);
        factory.withdrawFees(address(airdropToken), fee);
        vm.stopPrank();
        assertEq(airdropToken.balanceOf(newTreasury), fee);
    }

    // -- fuzz & invariant-style ------------------------------------------

    function testFuzz_percentFeeAccrual(uint96 total, uint16 bps) public {
        total = uint96(bound(total, 1, type(uint96).max));
        bps = uint16(bound(bps, 0, factory.MAX_FEE_BPS()));
        vm.prank(admin);
        factory.setFeeBps(address(airdropToken), bps);

        uint256 fee = uint256(total) * bps / 10_000;
        _verifyOperator(operator);
        airdropToken.mint(operator, uint256(total) + fee);
        vm.prank(operator);
        airdropToken.approve(address(factory), uint256(total) + fee);
        vm.prank(operator);
        address drop = factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            total,
            startTime,
            deadline,
            custReg
        );

        assertEq(airdropToken.balanceOf(drop), total);
        assertEq(factory.collectedFees(address(airdropToken)), fee);
    }

    function test_vaultConservation_overManyOps() public {
        _verifyOperator(operator);
        uint256 expected;
        uint256 fee = _expectedFee(TOTAL);
        for (uint256 i = 0; i < 5; i++) {
            _fund(operator, TOTAL);
            _createCsv(operator);
            expected += fee;
        }
        vm.prank(admin);
        factory.withdrawFees(address(airdropToken), fee * 2);
        expected -= fee * 2;
        assertEq(factory.collectedFees(address(airdropToken)), expected);
        assertEq(airdropToken.balanceOf(address(factory)), expected, "vault == fees - withdrawals");
    }
}
