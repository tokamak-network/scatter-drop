// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { DropFactory } from "../src/DropFactory.sol";
import { MerkleDrop } from "../src/MerkleDrop.sol";
import { IRegistryFactoryLike } from "../src/interfaces/IRegistryFactoryLike.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockIdentityRegistry } from "./mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "./mocks/MockRegistryFactory.sol";
import { MockFeeOnTransferERC20 } from "./mocks/MockFeeOnTransferERC20.sol";

/// @dev Contract with no `receive`/`fallback`, so a value-bearing call to it fails — used to
///      exercise the ETH-withdrawal failure path.
contract NoReceive { }

contract DropFactoryTest is Test {
    DropFactory internal factory;
    MockERC20 internal feeToken;
    MockERC20 internal airdropToken;
    MockIdentityRegistry internal opReg;
    MockRegistryFactory internal zkFactory;

    address internal constant ETH = address(0);

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal treasury = makeAddr("treasury");
    address internal custReg = makeAddr("custReg");

    bytes32 internal constant ROOT = keccak256("root");
    uint256 internal constant TOTAL = 1_000 ether;
    uint256 internal constant CSV_FEE = 10 ether; // ERC20 fee
    uint256 internal constant ETH_FEE = 0.01 ether;

    uint64 internal deadline;

    event AllowedTokenSet(address indexed token, DropFactory.TokenTier tier, address indexed caller);

    function setUp() public {
        feeToken = new MockERC20("Fee", "FEE", 18);
        airdropToken = new MockERC20("Drop", "DROP", 18);
        opReg = new MockIdentityRegistry();
        zkFactory = new MockRegistryFactory();
        zkFactory.setRegistry(custReg, true);

        factory = new DropFactory(admin, address(opReg), zkFactory, treasury);

        vm.startPrank(admin);
        factory.setFee(address(feeToken), uint8(DropFactory.AirdropType.CSV), CSV_FEE);
        factory.setFee(ETH, uint8(DropFactory.AirdropType.CSV), ETH_FEE);
        factory.setOfficialToken(address(airdropToken), true); // airdrop token registered
        vm.stopPrank();

        deadline = uint64(block.timestamp + 7 days);
    }

    // -- helpers ---------------------------------------------------------

    function _verifyOperator(address who) internal {
        opReg.setVerifiedUntil(who, uint64(block.timestamp + 365 days));
    }

    /// @dev Fund `who` with the ERC20 fee + airdrop tokens and approve the factory.
    function _fund(address who, uint256 fee, uint256 total) internal {
        feeToken.mint(who, fee);
        airdropToken.mint(who, total);
        vm.startPrank(who);
        feeToken.approve(address(factory), fee);
        airdropToken.approve(address(factory), total);
        vm.stopPrank();
    }

    /// @dev Create a TOTAL-sized drop of `airdropType` for `who`, paying the ERC20 fee.
    function _create(uint8 airdropType, address who) internal returns (address drop) {
        vm.prank(who);
        drop = factory.createDrop(
            airdropType, address(airdropToken), ROOT, TOTAL, deadline, custReg, address(feeToken)
        );
    }

    function _createCsv(address who) internal returns (address drop) {
        return _create(uint8(DropFactory.AirdropType.CSV), who);
    }

    // -- createDrop: happy path & wiring (ERC20 fee) ---------------------

    function test_createDrop_wiresDropAndMovesFunds() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);

        address drop = _createCsv(operator);

        MerkleDrop md = MerkleDrop(drop);
        assertEq(md.factory(), address(factory), "factory");
        assertEq(address(md.token()), address(airdropToken), "token");
        assertEq(md.operator(), operator, "operator");
        assertEq(md.merkleRoot(), ROOT, "root");
        assertEq(md.deadline(), deadline, "deadline");
        assertEq(address(md.identityRegistry()), custReg, "identityRegistry");

        assertEq(airdropToken.balanceOf(drop), TOTAL, "drop funded");
        assertEq(airdropToken.balanceOf(operator), 0, "operator drained");
        assertEq(feeToken.balanceOf(address(factory)), CSV_FEE, "fee in vault");
        assertEq(factory.collectedFees(address(feeToken)), CSV_FEE, "collected accounting");

        assertEq(factory.dropsLength(), 1, "drops length");
        assertEq(factory.dropAt(0), drop, "dropAt");
        assertEq(factory.allDrops()[0], drop, "allDrops");
    }

    function test_createDrop_payWithEth() public {
        _verifyOperator(operator);
        airdropToken.mint(operator, TOTAL);
        vm.prank(operator);
        airdropToken.approve(address(factory), TOTAL);
        vm.deal(operator, ETH_FEE);

        vm.prank(operator);
        address drop = factory.createDrop{ value: ETH_FEE }(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, deadline, custReg, ETH
        );

        assertEq(airdropToken.balanceOf(drop), TOTAL);
        assertEq(factory.collectedFees(ETH), ETH_FEE, "eth fee accrued");
        assertEq(address(factory).balance, ETH_FEE, "factory holds eth");
    }

    function test_createDrop_payWithEthZeroFeeType() public {
        // SOCIAL has no ETH price (0); paying ETH with value 0 succeeds (free).
        _verifyOperator(operator);
        airdropToken.mint(operator, TOTAL);
        vm.prank(operator);
        airdropToken.approve(address(factory), TOTAL);

        vm.prank(operator);
        address drop = factory.createDrop(
            uint8(DropFactory.AirdropType.SOCIAL), address(airdropToken), ROOT, TOTAL, deadline, custReg, ETH
        );
        assertEq(airdropToken.balanceOf(drop), TOTAL);
        assertEq(factory.collectedFees(ETH), 0);
    }

    function test_createDrop_emitsDropCreated() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);

        vm.expectEmit(false, true, true, true, address(factory));
        emit DropFactory.DropCreated(
            address(0),
            operator,
            DropFactory.AirdropType.CSV,
            address(airdropToken),
            custReg,
            ROOT,
            TOTAL,
            deadline,
            CSV_FEE
        );
        _createCsv(operator);
    }

    // -- createDrop: gate 1 ----------------------------------------------

    function test_createDrop_revertsWhenOperatorUnverified() public {
        _fund(operator, CSV_FEE, TOTAL);
        vm.prank(operator);
        vm.expectRevert(DropFactory.OperatorNotVerified.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            deadline,
            custReg,
            address(feeToken)
        );
    }

    function test_createDrop_revertsWhenOperatorVerificationExpired() public {
        opReg.setVerifiedUntil(operator, uint64(block.timestamp));
        _fund(operator, CSV_FEE, TOTAL);
        vm.warp(block.timestamp + 1);
        vm.prank(operator);
        vm.expectRevert(DropFactory.OperatorNotVerified.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            deadline,
            custReg,
            address(feeToken)
        );
    }

    function test_createDrop_succeedsWhenVerifiedUntilEqualsNow() public {
        opReg.setVerifiedUntil(operator, uint64(block.timestamp));
        _fund(operator, CSV_FEE, TOTAL);
        address drop = _createCsv(operator);
        assertTrue(drop != address(0));
    }

    // -- createDrop: registry / token allow-list -------------------------

    function test_createDrop_revertsWhenRegistryNotStandard() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        address fakeReg = makeAddr("fakeReg");
        vm.prank(operator);
        vm.expectRevert(DropFactory.NotAStandardRegistry.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            deadline,
            fakeReg,
            address(feeToken)
        );
    }

    function test_createDrop_revertsWhenTokenNotAllowed() public {
        MockERC20 fresh = new MockERC20("Unlisted", "UNL", 18);
        _verifyOperator(operator);
        fresh.mint(operator, TOTAL);
        feeToken.mint(operator, CSV_FEE);
        vm.startPrank(operator);
        fresh.approve(address(factory), TOTAL);
        feeToken.approve(address(factory), CSV_FEE);
        vm.expectRevert(DropFactory.TokenNotAllowed.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(fresh),
            ROOT,
            TOTAL,
            deadline,
            custReg,
            address(feeToken)
        );
        vm.stopPrank();
    }

    // -- createDrop: input validation ------------------------------------

    function test_createDrop_revertsOnBadAirdropType() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidAirdropType.selector);
        factory.createDrop(4, address(airdropToken), ROOT, TOTAL, deadline, custReg, address(feeToken));
    }

    function test_createDrop_revertsOnZeroToken() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(0), ROOT, TOTAL, deadline, custReg, address(feeToken)
        );
    }

    function test_createDrop_revertsOnZeroRegistry() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            deadline,
            address(0),
            address(feeToken)
        );
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
            deadline,
            custReg,
            address(feeToken)
        );
    }

    function test_createDrop_revertsOnZeroTotal() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.ZeroTotalAmount.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            0,
            deadline,
            custReg,
            address(feeToken)
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
            uint64(block.timestamp),
            custReg,
            address(feeToken)
        );
    }

    function test_createDrop_revertsWhenDeadlineBeforeMinDuration() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        uint64 tooSoon = uint64(block.timestamp + factory.MIN_DURATION() - 1);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidDeadline.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            tooSoon,
            custReg,
            address(feeToken)
        );
    }

    function test_createDrop_succeedsAtExactlyMinDuration() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        uint64 atMin = uint64(block.timestamp + factory.MIN_DURATION());
        vm.prank(operator);
        address drop = factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            atMin,
            custReg,
            address(feeToken)
        );
        assertTrue(drop != address(0));
    }

    function test_createDrop_revertsOnEoaAirdropToken() public {
        // EOA airdrop token is rejected by the contract check, which runs before the tier guard.
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.NotAContract.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            makeAddr("eoa"),
            ROOT,
            TOTAL,
            deadline,
            custReg,
            address(feeToken)
        );
    }

    // -- createDrop: fee branches ----------------------------------------

    function test_createDrop_erc20_revertsWhenEthSent() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        vm.deal(operator, 1 ether);
        vm.prank(operator);
        vm.expectRevert(DropFactory.IncorrectFee.selector);
        factory.createDrop{ value: 1 }(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            deadline,
            custReg,
            address(feeToken)
        );
    }

    function test_createDrop_erc20_revertsWhenFeeNotConfigured() public {
        // A registered airdrop token but an unpriced fee token (SOCIAL has no ERC20 price).
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        vm.prank(operator);
        vm.expectRevert(DropFactory.FeeNotConfigured.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.SOCIAL),
            address(airdropToken),
            ROOT,
            TOTAL,
            deadline,
            custReg,
            address(feeToken)
        );
    }

    function test_createDrop_eth_revertsOnWrongValue() public {
        _verifyOperator(operator);
        airdropToken.mint(operator, TOTAL);
        vm.prank(operator);
        airdropToken.approve(address(factory), TOTAL);
        vm.deal(operator, 1 ether);
        vm.prank(operator);
        vm.expectRevert(DropFactory.IncorrectFee.selector);
        factory.createDrop{ value: ETH_FEE - 1 }(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, deadline, custReg, ETH
        );
    }

    function test_createDrop_revertsOnFeeOnTransferAirdropToken() public {
        MockFeeOnTransferERC20 fot = new MockFeeOnTransferERC20("Tax", "TAX", 100);
        vm.prank(admin);
        factory.setOfficialToken(address(fot), true);
        _verifyOperator(operator);
        fot.mint(operator, TOTAL);
        vm.prank(operator);
        fot.approve(address(factory), TOTAL);
        // SOCIAL + ETH (value 0) isolates the airdrop-funding receipt check.
        vm.prank(operator);
        vm.expectRevert(DropFactory.IncorrectAmountReceived.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.SOCIAL), address(fot), ROOT, TOTAL, deadline, custReg, ETH
        );
    }

    function test_createDrop_revertsOnFeeOnTransferFeeToken() public {
        MockFeeOnTransferERC20 fot = new MockFeeOnTransferERC20("TaxFee", "TXF", 50);
        vm.prank(admin);
        factory.setFee(address(fot), uint8(DropFactory.AirdropType.CSV), CSV_FEE);

        _verifyOperator(operator);
        fot.mint(operator, CSV_FEE);
        airdropToken.mint(operator, TOTAL);
        vm.startPrank(operator);
        fot.approve(address(factory), CSV_FEE);
        airdropToken.approve(address(factory), TOTAL);
        vm.expectRevert(DropFactory.IncorrectAmountReceived.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            deadline,
            custReg,
            address(fot)
        );
        vm.stopPrank();
    }

    // -- fees: 2D accrual & views ----------------------------------------

    function test_feeOf_perFeeTokenAndType() public view {
        assertEq(factory.feeOf(address(feeToken), uint8(DropFactory.AirdropType.CSV)), CSV_FEE);
        assertEq(factory.feeOf(ETH, uint8(DropFactory.AirdropType.CSV)), ETH_FEE);
        assertEq(factory.feeOf(address(feeToken), uint8(DropFactory.AirdropType.SOCIAL)), 0);
    }

    function test_collectedFees_keyedByFeeToken() public {
        _verifyOperator(operator);
        // ERC20-paid drop
        _fund(operator, CSV_FEE, TOTAL);
        _createCsv(operator);
        // ETH-paid drop
        airdropToken.mint(operator, TOTAL);
        vm.prank(operator);
        airdropToken.approve(address(factory), TOTAL);
        vm.deal(operator, ETH_FEE);
        vm.prank(operator);
        factory.createDrop{ value: ETH_FEE }(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, deadline, custReg, ETH
        );

        assertEq(factory.collectedFees(address(feeToken)), CSV_FEE);
        assertEq(factory.collectedFees(ETH), ETH_FEE);
    }

    function test_setFee_onlyOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        factory.setFee(address(feeToken), uint8(DropFactory.AirdropType.CSV), 1);
    }

    // -- token registry --------------------------------------------------

    function test_addAllowedToken_byVerifiedOperator_setsCommunity() public {
        MockERC20 t = new MockERC20("T", "T", 18);
        _verifyOperator(operator);
        vm.expectEmit(true, true, false, true, address(factory));
        emit AllowedTokenSet(address(t), DropFactory.TokenTier.COMMUNITY, operator);
        vm.prank(operator);
        factory.addAllowedToken(address(t));
        assertEq(uint8(factory.tokenTier(address(t))), uint8(DropFactory.TokenTier.COMMUNITY));
        assertTrue(factory.isAllowed(address(t)));
    }

    function test_addAllowedToken_revertsWhenOperatorUnverified() public {
        MockERC20 t = new MockERC20("T", "T", 18);
        vm.prank(operator);
        vm.expectRevert(DropFactory.OperatorNotVerified.selector);
        factory.addAllowedToken(address(t));
    }

    function test_addAllowedToken_revertsOnEoaToken() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.NotAContract.selector);
        factory.addAllowedToken(makeAddr("eoa"));
    }

    function test_addAllowedToken_doesNotDowngradeOfficial() public {
        // airdropToken is OFFICIAL from setUp
        _verifyOperator(operator);
        vm.prank(operator);
        factory.addAllowedToken(address(airdropToken));
        assertEq(uint8(factory.tokenTier(address(airdropToken))), uint8(DropFactory.TokenTier.OFFICIAL));
    }

    function test_addAllowedToken_idempotentNoopSkipsGates() public {
        MockERC20 t = new MockERC20("T", "T", 18);
        _verifyOperator(operator);
        vm.prank(operator);
        factory.addAllowedToken(address(t));
        // Re-add by an unverified stranger is a no-op (gates skipped), no revert.
        vm.prank(makeAddr("stranger"));
        factory.addAllowedToken(address(t));
        assertEq(uint8(factory.tokenTier(address(t))), uint8(DropFactory.TokenTier.COMMUNITY));
    }

    function test_setOfficialToken_onlyOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        factory.setOfficialToken(address(airdropToken), true);
    }

    function test_setOfficialToken_setsOfficialAndRequiresContract() public {
        MockERC20 t = new MockERC20("T", "T", 18);
        vm.startPrank(admin);
        vm.expectRevert(DropFactory.NotAContract.selector);
        factory.setOfficialToken(makeAddr("eoa"), true);
        factory.setOfficialToken(address(t), true);
        vm.stopPrank();
        assertEq(uint8(factory.tokenTier(address(t))), uint8(DropFactory.TokenTier.OFFICIAL));
    }

    function test_setOfficialToken_redundantOfficialIsNoop() public {
        vm.startPrank(admin);
        factory.setOfficialToken(address(airdropToken), true); // already OFFICIAL from setUp
        vm.stopPrank();
        assertEq(uint8(factory.tokenTier(address(airdropToken))), uint8(DropFactory.TokenTier.OFFICIAL));
    }

    function test_setOfficialToken_unsetDemotesToCommunity() public {
        vm.prank(admin);
        factory.setOfficialToken(address(airdropToken), false);
        assertEq(uint8(factory.tokenTier(address(airdropToken))), uint8(DropFactory.TokenTier.COMMUNITY));
    }

    function test_setOfficialToken_unsetOnNonOfficialIsNoop() public {
        MockERC20 t = new MockERC20("T", "T", 18);
        vm.prank(admin);
        factory.setOfficialToken(address(t), false);
        assertEq(uint8(factory.tokenTier(address(t))), uint8(DropFactory.TokenTier.NONE));
    }

    function test_removeAllowedToken_onlyOwnerSetsNone() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        factory.removeAllowedToken(address(airdropToken));

        vm.prank(admin);
        factory.removeAllowedToken(address(airdropToken));
        assertEq(uint8(factory.tokenTier(address(airdropToken))), uint8(DropFactory.TokenTier.NONE));
        assertFalse(factory.isAllowed(address(airdropToken)));
    }

    function test_removeAllowedToken_noopWhenNone() public {
        MockERC20 t = new MockERC20("T", "T", 18);
        vm.prank(admin);
        factory.removeAllowedToken(address(t)); // already NONE → no-op
        assertEq(uint8(factory.tokenTier(address(t))), uint8(DropFactory.TokenTier.NONE));
    }

    // -- admin: access control & validation ------------------------------

    function test_onlyOwner_setters() public {
        bytes memory denied = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator);
        vm.startPrank(operator);
        vm.expectRevert(denied);
        factory.setFee(address(feeToken), uint8(DropFactory.AirdropType.CSV), 1);
        vm.expectRevert(denied);
        factory.setOperatorRegistry(address(opReg));
        vm.expectRevert(denied);
        factory.setZkFactory(zkFactory);
        vm.expectRevert(denied);
        factory.setTreasury(treasury);
        vm.expectRevert(denied);
        factory.withdrawFees(address(feeToken), 1);
        vm.stopPrank();
    }

    function test_setters_rejectZeroAddress() public {
        vm.startPrank(admin);
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.setOperatorRegistry(address(0));
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.setZkFactory(IRegistryFactoryLike(address(0)));
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.setTreasury(address(0));
        vm.stopPrank();
    }

    function test_setOperatorRegistry_takesEffect() public {
        MockIdentityRegistry newReg = new MockIdentityRegistry();
        vm.prank(admin);
        factory.setOperatorRegistry(address(newReg));
        assertEq(factory.operatorRegistry(), address(newReg));

        _verifyOperator(operator); // verified on OLD registry only
        _fund(operator, CSV_FEE, TOTAL);
        vm.prank(operator);
        vm.expectRevert(DropFactory.OperatorNotVerified.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            TOTAL,
            deadline,
            custReg,
            address(feeToken)
        );
    }

    function test_setZkFactory_updatesFactory() public {
        MockRegistryFactory newZk = new MockRegistryFactory();
        vm.prank(admin);
        factory.setZkFactory(newZk);
        assertEq(address(factory.zkFactory()), address(newZk));
    }

    function test_setOperatorRegistry_revertsOnEoa() public {
        vm.prank(admin);
        vm.expectRevert(DropFactory.NotAContract.selector);
        factory.setOperatorRegistry(makeAddr("eoa"));
    }

    function test_setZkFactory_revertsOnEoa() public {
        vm.prank(admin);
        vm.expectRevert(DropFactory.NotAContract.selector);
        factory.setZkFactory(IRegistryFactoryLike(makeAddr("eoa")));
    }

    // -- constructor -----------------------------------------------------

    function test_constructor_revertsOnZeroOperatorRegistry() public {
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        new DropFactory(admin, address(0), zkFactory, treasury);
    }

    function test_constructor_revertsOnZeroZkFactory() public {
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        new DropFactory(admin, address(opReg), IRegistryFactoryLike(address(0)), treasury);
    }

    function test_constructor_revertsOnZeroTreasury() public {
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        new DropFactory(admin, address(opReg), zkFactory, address(0));
    }

    function test_constructor_revertsOnEoaOperatorRegistry() public {
        vm.expectRevert(DropFactory.NotAContract.selector);
        new DropFactory(admin, makeAddr("eoa"), zkFactory, treasury);
    }

    function test_constructor_revertsOnEoaZkFactory() public {
        vm.expectRevert(DropFactory.NotAContract.selector);
        new DropFactory(admin, address(opReg), IRegistryFactoryLike(makeAddr("eoa")), treasury);
    }

    // -- withdrawFees: ERC20 ---------------------------------------------

    function test_withdrawFees_toTreasuryOnly() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        _createCsv(operator);

        vm.prank(admin);
        factory.withdrawFees(address(feeToken), CSV_FEE);
        assertEq(feeToken.balanceOf(treasury), CSV_FEE, "treasury received");
        assertEq(feeToken.balanceOf(address(factory)), 0, "vault drained");
        assertEq(factory.collectedFees(address(feeToken)), 0, "accounting cleared");
    }

    function test_withdrawFees_partial() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        _createCsv(operator);
        vm.prank(admin);
        factory.withdrawFees(address(feeToken), CSV_FEE / 2);
        assertEq(factory.collectedFees(address(feeToken)), CSV_FEE - CSV_FEE / 2);
        assertEq(feeToken.balanceOf(treasury), CSV_FEE / 2);
    }

    function test_withdrawFees_zeroAmountIsNoop() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        _createCsv(operator);
        vm.prank(admin);
        factory.withdrawFees(address(feeToken), 0);
        assertEq(factory.collectedFees(address(feeToken)), CSV_FEE);
        assertEq(feeToken.balanceOf(treasury), 0);
    }

    function test_withdrawFees_revertsOnOverdraw() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        _createCsv(operator);
        vm.prank(admin);
        vm.expectRevert(DropFactory.InsufficientCollectedFees.selector);
        factory.withdrawFees(address(feeToken), CSV_FEE + 1);
    }

    function test_withdrawFees_honorsUpdatedTreasury() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        _createCsv(operator);
        address newTreasury = makeAddr("newTreasury");
        vm.startPrank(admin);
        factory.setTreasury(newTreasury);
        factory.withdrawFees(address(feeToken), CSV_FEE);
        vm.stopPrank();
        assertEq(feeToken.balanceOf(newTreasury), CSV_FEE);
        assertEq(feeToken.balanceOf(treasury), 0);
    }

    // -- withdrawFees: ETH -----------------------------------------------

    function test_withdrawFees_eth_toTreasury() public {
        _verifyOperator(operator);
        airdropToken.mint(operator, TOTAL);
        vm.prank(operator);
        airdropToken.approve(address(factory), TOTAL);
        vm.deal(operator, ETH_FEE);
        vm.prank(operator);
        factory.createDrop{ value: ETH_FEE }(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, deadline, custReg, ETH
        );

        uint256 before = treasury.balance;
        vm.prank(admin);
        factory.withdrawFees(ETH, ETH_FEE);
        assertEq(treasury.balance - before, ETH_FEE, "treasury got eth");
        assertEq(factory.collectedFees(ETH), 0);
        assertEq(address(factory).balance, 0);
    }

    function test_withdrawFees_eth_revertsWhenTreasuryRejects() public {
        NoReceive sink = new NoReceive();
        vm.prank(admin);
        factory.setTreasury(address(sink));

        _verifyOperator(operator);
        airdropToken.mint(operator, TOTAL);
        vm.prank(operator);
        airdropToken.approve(address(factory), TOTAL);
        vm.deal(operator, ETH_FEE);
        vm.prank(operator);
        factory.createDrop{ value: ETH_FEE }(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, deadline, custReg, ETH
        );

        vm.prank(admin);
        vm.expectRevert(DropFactory.EthTransferFailed.selector);
        factory.withdrawFees(ETH, ETH_FEE);
    }

    // -- fuzz & invariant-style ------------------------------------------

    function testFuzz_feeAccrual(uint96 fee, uint96 total) public {
        vm.assume(total > 0);
        vm.prank(admin);
        factory.setFee(address(feeToken), uint8(DropFactory.AirdropType.CSV), fee);

        _verifyOperator(operator);
        // ERC20 path requires fee > 0; for fee == 0 use the ETH path instead.
        if (fee == 0) {
            airdropToken.mint(operator, total);
            vm.prank(operator);
            airdropToken.approve(address(factory), total);
            vm.prank(operator);
            address drop = factory.createDrop(
                uint8(DropFactory.AirdropType.SOCIAL),
                address(airdropToken),
                ROOT,
                total,
                deadline,
                custReg,
                ETH
            );
            assertEq(airdropToken.balanceOf(drop), total);
            return;
        }
        _fund(operator, fee, total);
        vm.prank(operator);
        address drop2 = factory.createDrop(
            uint8(DropFactory.AirdropType.CSV),
            address(airdropToken),
            ROOT,
            total,
            deadline,
            custReg,
            address(feeToken)
        );
        assertEq(airdropToken.balanceOf(drop2), total);
        assertEq(factory.collectedFees(address(feeToken)), fee);
    }

    function test_vaultConservation_overManyOps() public {
        _verifyOperator(operator);
        uint256 expected;
        for (uint256 i = 0; i < 5; i++) {
            _fund(operator, CSV_FEE, TOTAL);
            _createCsv(operator);
            expected += CSV_FEE;
        }
        vm.prank(admin);
        factory.withdrawFees(address(feeToken), CSV_FEE * 2);
        expected -= CSV_FEE * 2;

        assertEq(factory.collectedFees(address(feeToken)), expected);
        assertEq(feeToken.balanceOf(address(factory)), expected, "vault == fees - withdrawals");
    }
}
