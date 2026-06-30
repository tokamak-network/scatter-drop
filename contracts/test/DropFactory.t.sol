// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { DropFactory } from "../src/DropFactory.sol";
import { MerkleDrop } from "../src/MerkleDrop.sol";
import { IRegistryFactoryLike } from "../src/interfaces/IRegistryFactoryLike.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockIdentityRegistry } from "./mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "./mocks/MockRegistryFactory.sol";
import { MockFeeOnTransferERC20 } from "./mocks/MockFeeOnTransferERC20.sol";

contract DropFactoryTest is Test {
    DropFactory internal factory;
    MockERC20 internal feeToken;
    MockERC20 internal airdropToken;
    MockIdentityRegistry internal opReg;
    MockRegistryFactory internal zkFactory;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal treasury = makeAddr("treasury");
    address internal custReg = makeAddr("custReg");

    bytes32 internal constant ROOT = keccak256("root");
    uint256 internal constant TOTAL = 1_000 ether;
    uint256 internal constant CSV_FEE = 10 ether;

    uint64 internal deadline;

    /// @dev Mirror of DropFactory.DropCreated so tests can `vm.expectEmit` against it.
    event DropCreated(
        address indexed drop,
        address indexed operator,
        DropFactory.AirdropType indexed airdropType,
        address airdropToken,
        address identityRegistry,
        bytes32 merkleRoot,
        uint256 totalAmount,
        uint64 deadline,
        uint256 fee
    );

    function setUp() public {
        feeToken = new MockERC20("Fee", "FEE", 18);
        airdropToken = new MockERC20("Drop", "DROP", 18);
        opReg = new MockIdentityRegistry();
        zkFactory = new MockRegistryFactory();
        zkFactory.setRegistry(custReg, true);

        factory = new DropFactory(admin, IERC20(address(feeToken)), address(opReg), zkFactory, treasury);

        vm.prank(admin);
        factory.setFee(uint8(DropFactory.AirdropType.CSV), CSV_FEE);

        deadline = uint64(block.timestamp + 7 days);
    }

    // -- helpers ---------------------------------------------------------

    /// @dev Mark `who` as a verified operator far into the future.
    function _verifyOperator(address who) internal {
        opReg.setVerifiedUntil(who, uint64(block.timestamp + 365 days));
    }

    /// @dev Fund `who` with fee + airdrop tokens and approve the factory.
    function _fund(address who, uint256 fee, uint256 total) internal {
        feeToken.mint(who, fee);
        airdropToken.mint(who, total);
        vm.startPrank(who);
        feeToken.approve(address(factory), fee);
        airdropToken.approve(address(factory), total);
        vm.stopPrank();
    }

    /// @dev Create a TOTAL-sized drop of `airdropType` for `who` against the standard registry.
    ///      Caller is responsible for funding/approving `who` first (see `_fund`).
    function _create(uint8 airdropType, address who) internal returns (address drop) {
        vm.prank(who);
        drop = factory.createDrop(airdropType, address(airdropToken), ROOT, TOTAL, deadline, custReg);
    }

    function _createCsv(address who) internal returns (address drop) {
        return _create(uint8(DropFactory.AirdropType.CSV), who);
    }

    // -- createDrop: happy path & wiring ---------------------------------

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

    function test_createDrop_emitsDropCreated() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);

        // Drop address (topic1) is unknown pre-deploy; verify operator/type topics + full data payload.
        vm.expectEmit(false, true, true, true, address(factory));
        emit DropCreated(
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

    function test_createDrop_zeroFeeType_skipsFeePull() public {
        // SOCIAL fee left at 0 → no feeToken transfer required.
        _verifyOperator(operator);
        _fund(operator, 0, TOTAL);
        address drop = _create(uint8(DropFactory.AirdropType.SOCIAL), operator);

        assertEq(airdropToken.balanceOf(drop), TOTAL);
        assertEq(factory.collectedFees(address(feeToken)), 0, "no fee accrued");
    }

    // -- createDrop: gate 1 (operator verification) ----------------------

    function test_createDrop_revertsWhenOperatorUnverified() public {
        _fund(operator, CSV_FEE, TOTAL); // not verified
        vm.prank(operator);
        vm.expectRevert(DropFactory.OperatorNotVerified.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, deadline, custReg
        );
    }

    function test_createDrop_revertsWhenOperatorVerificationExpired() public {
        opReg.setVerifiedUntil(operator, uint64(block.timestamp)); // valid only "now"
        _fund(operator, CSV_FEE, TOTAL);
        vm.warp(block.timestamp + 1); // now strictly past verifiedUntil
        vm.prank(operator);
        vm.expectRevert(DropFactory.OperatorNotVerified.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, deadline, custReg
        );
    }

    function test_createDrop_succeedsWhenVerifiedUntilEqualsNow() public {
        // verifiedUntil >= block.timestamp is the pass condition (boundary inclusive).
        opReg.setVerifiedUntil(operator, uint64(block.timestamp));
        _fund(operator, CSV_FEE, TOTAL);
        address drop = _createCsv(operator);
        assertTrue(drop != address(0));
    }

    // -- createDrop: customer registry validation ------------------------

    function test_createDrop_revertsWhenRegistryNotStandard() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        address fakeReg = makeAddr("fakeReg"); // never registered in zkFactory
        vm.prank(operator);
        vm.expectRevert(DropFactory.NotAStandardRegistry.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, deadline, fakeReg
        );
    }

    // -- createDrop: input validation ------------------------------------

    function test_createDrop_revertsOnBadAirdropType() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidAirdropType.selector);
        factory.createDrop(4, address(airdropToken), ROOT, TOTAL, deadline, custReg);
    }

    function test_createDrop_revertsOnZeroToken() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.createDrop(uint8(DropFactory.AirdropType.CSV), address(0), ROOT, TOTAL, deadline, custReg);
    }

    function test_createDrop_revertsOnZeroRegistry() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, deadline, address(0)
        );
    }

    function test_createDrop_revertsOnZeroRoot() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidMerkleRoot.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), bytes32(0), TOTAL, deadline, custReg
        );
    }

    function test_createDrop_revertsOnZeroTotal() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.ZeroTotalAmount.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, 0, deadline, custReg
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
            custReg
        );
    }

    function test_createDrop_revertsWhenDeadlineBeforeMinDuration() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        // Just under MIN_DURATION in the future.
        uint64 tooSoon = uint64(block.timestamp + factory.MIN_DURATION() - 1);
        vm.prank(operator);
        vm.expectRevert(DropFactory.InvalidDeadline.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, tooSoon, custReg
        );
    }

    function test_createDrop_succeedsAtExactlyMinDuration() public {
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        uint64 atMin = uint64(block.timestamp + factory.MIN_DURATION());
        vm.prank(operator);
        address drop = factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, atMin, custReg
        );
        assertTrue(drop != address(0));
    }

    function test_createDrop_revertsWhenFeeSetButTokenUnset() public {
        // Deploy a factory whose fee token is zero, then set a non-zero fee.
        DropFactory f = new DropFactory(admin, IERC20(address(0)), address(opReg), zkFactory, treasury);
        vm.prank(admin);
        f.setFee(uint8(DropFactory.AirdropType.CSV), CSV_FEE);

        _verifyOperator(operator);
        airdropToken.mint(operator, TOTAL);
        vm.prank(operator);
        airdropToken.approve(address(f), TOTAL);

        vm.prank(operator);
        vm.expectRevert(DropFactory.FeeTokenNotSet.selector);
        f.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, deadline, custReg
        );
    }

    // -- per-type fee accrual --------------------------------------------

    function test_feeOf_perTypeAndAccrual() public {
        uint256 snapFee = 25 ether;
        vm.prank(admin);
        factory.setFee(uint8(DropFactory.AirdropType.ONCHAIN_SNAPSHOT), snapFee);

        assertEq(factory.feeOf(uint8(DropFactory.AirdropType.CSV)), CSV_FEE);
        assertEq(factory.feeOf(uint8(DropFactory.AirdropType.ONCHAIN_SNAPSHOT)), snapFee);
        assertEq(factory.feeOf(uint8(DropFactory.AirdropType.SOCIAL)), 0);

        _verifyOperator(operator);
        // One CSV drop + one SNAPSHOT drop → vault should hold both fees.
        _fund(operator, CSV_FEE, TOTAL);
        _createCsv(operator);

        _fund(operator, snapFee, TOTAL);
        _create(uint8(DropFactory.AirdropType.ONCHAIN_SNAPSHOT), operator);

        assertEq(factory.collectedFees(address(feeToken)), CSV_FEE + snapFee);
    }

    // -- admin: access control -------------------------------------------

    function test_onlyOwner_setters() public {
        bytes memory denied = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator);

        vm.startPrank(operator);
        vm.expectRevert(denied);
        factory.setFee(uint8(DropFactory.AirdropType.CSV), 1);
        vm.expectRevert(denied);
        factory.setFeeToken(IERC20(address(feeToken)));
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

        // Verified on the OLD registry only → now rejected.
        _verifyOperator(operator);
        _fund(operator, CSV_FEE, TOTAL);
        vm.prank(operator);
        vm.expectRevert(DropFactory.OperatorNotVerified.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, deadline, custReg
        );
    }

    // -- exact-receipt guard (IncorrectAmountReceived) -------------------

    function test_createDrop_revertsOnFeeOnTransferAirdropToken() public {
        MockFeeOnTransferERC20 fot = new MockFeeOnTransferERC20("Tax", "TAX", 100); // 1% transfer fee
        _verifyOperator(operator);
        fot.mint(operator, TOTAL);
        vm.prank(operator);
        fot.approve(address(factory), TOTAL);

        // SOCIAL fee is 0, so this isolates the airdrop-funding receipt check.
        vm.prank(operator);
        vm.expectRevert(DropFactory.IncorrectAmountReceived.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.SOCIAL), address(fot), ROOT, TOTAL, deadline, custReg
        );
    }

    function test_createDrop_revertsOnFeeOnTransferFeeToken() public {
        MockFeeOnTransferERC20 fot = new MockFeeOnTransferERC20("TaxFee", "TXF", 50); // 0.5%
        DropFactory f = new DropFactory(admin, IERC20(address(fot)), address(opReg), zkFactory, treasury);
        vm.prank(admin);
        f.setFee(uint8(DropFactory.AirdropType.CSV), CSV_FEE);

        _verifyOperator(operator);
        fot.mint(operator, CSV_FEE);
        airdropToken.mint(operator, TOTAL);
        vm.startPrank(operator);
        fot.approve(address(f), CSV_FEE);
        airdropToken.approve(address(f), TOTAL);
        vm.expectRevert(DropFactory.IncorrectAmountReceived.selector);
        f.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, TOTAL, deadline, custReg
        );
        vm.stopPrank();
    }

    // -- contract-address validation (NotAContract) ----------------------

    function test_constructor_revertsOnEoaOperatorRegistry() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(DropFactory.NotAContract.selector);
        new DropFactory(admin, IERC20(address(feeToken)), eoa, zkFactory, treasury);
    }

    function test_constructor_revertsOnEoaZkFactory() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(DropFactory.NotAContract.selector);
        new DropFactory(admin, IERC20(address(feeToken)), address(opReg), IRegistryFactoryLike(eoa), treasury);
    }

    function test_constructor_revertsOnEoaFeeToken() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(DropFactory.NotAContract.selector);
        new DropFactory(admin, IERC20(eoa), address(opReg), zkFactory, treasury);
    }

    function test_constructor_allowsZeroFeeToken() public {
        // address(0) fee token is permitted (valid only when all fees stay 0).
        DropFactory f = new DropFactory(admin, IERC20(address(0)), address(opReg), zkFactory, treasury);
        assertEq(address(f.feeToken()), address(0));
    }

    function test_setFeeToken_revertsOnEoa() public {
        vm.prank(admin);
        vm.expectRevert(DropFactory.NotAContract.selector);
        factory.setFeeToken(IERC20(makeAddr("eoa")));
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

    function test_createDrop_revertsOnEoaAirdropToken() public {
        _verifyOperator(operator);
        vm.prank(operator);
        vm.expectRevert(DropFactory.NotAContract.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), makeAddr("eoa"), ROOT, TOTAL, deadline, custReg
        );
    }

    // -- withdrawFees: fixed treasury ------------------------------------

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

        // Nothing moved, accounting untouched.
        assertEq(factory.collectedFees(address(feeToken)), CSV_FEE);
        assertEq(feeToken.balanceOf(treasury), 0);
        assertEq(feeToken.balanceOf(address(factory)), CSV_FEE);
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

    // -- fuzz ------------------------------------------------------------

    function testFuzz_feeAccrual(uint96 fee, uint96 total) public {
        vm.assume(total > 0);
        vm.prank(admin);
        factory.setFee(uint8(DropFactory.AirdropType.CSV), fee);

        _verifyOperator(operator);
        _fund(operator, fee, total);

        vm.prank(operator);
        address drop = factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(airdropToken), ROOT, total, deadline, custReg
        );

        assertEq(airdropToken.balanceOf(drop), total);
        assertEq(factory.collectedFees(address(feeToken)), fee);
        assertEq(feeToken.balanceOf(address(factory)), fee);
    }

    // -- invariant-style: vault balance == Σfees − Σwithdrawals ----------

    function test_vaultConservation_overManyOps() public {
        vm.prank(admin);
        factory.setFee(uint8(DropFactory.AirdropType.CSV), CSV_FEE);
        _verifyOperator(operator);

        uint256 expected;
        for (uint256 i = 0; i < 5; i++) {
            _fund(operator, CSV_FEE, TOTAL);
            _createCsv(operator);
            expected += CSV_FEE;
        }
        // withdraw part-way
        vm.prank(admin);
        factory.withdrawFees(address(feeToken), CSV_FEE * 2);
        expected -= CSV_FEE * 2;

        assertEq(factory.collectedFees(address(feeToken)), expected);
        assertEq(feeToken.balanceOf(address(factory)), expected, "vault == fees - withdrawals");
    }
}
