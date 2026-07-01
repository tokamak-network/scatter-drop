// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";

import { DropFactory } from "../src/DropFactory.sol";
import { MerkleDrop } from "../src/MerkleDrop.sol";
import { MockIdentityRegistry } from "./mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "./mocks/MockRegistryFactory.sol";

/// @notice Native-ETH airdrop path: creation funds the drop with ETH, the fee is
///         retained as ETH in the vault, and claims/sweep/withdraw move ETH.
contract NativeDropTest is Test {
    DropFactory internal factory;
    MockIdentityRegistry internal opReg;
    MockRegistryFactory internal zkFactory;

    address internal constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal treasury = makeAddr("treasury");
    address internal claimer = makeAddr("claimer");

    uint8 internal constant CSV = uint8(DropFactory.AirdropType.CSV);
    uint256 internal constant TOTAL = 10 ether;
    uint256 internal constant AMT = 3 ether;

    uint64 internal startTime;
    uint64 internal deadline;
    bytes32 internal root; // single-leaf tree: root == leaf, empty proof

    function setUp() public {
        opReg = new MockIdentityRegistry();
        zkFactory = new MockRegistryFactory();
        factory = new DropFactory(admin, address(opReg), zkFactory, treasury);

        vm.prank(admin);
        factory.setAllowedToken(NATIVE, true); // curate native ETH (no contract check)

        opReg.setVerifiedUntil(operator, uint64(block.timestamp + 365 days));

        startTime = uint64(block.timestamp);
        deadline = uint64(block.timestamp + 7 days);
        // Single-leaf Merkle tree for `claimer` at index 0: the root equals the leaf.
        root = keccak256(abi.encodePacked(uint256(0), claimer, AMT));
    }

    function _fee() internal view returns (uint256) {
        return factory.feeOf(NATIVE, TOTAL);
    }

    /// @dev Create an open (no customer gate) native drop funded by the operator.
    function _createNative() internal returns (address drop) {
        uint256 value = TOTAL + _fee();
        vm.deal(operator, value);
        vm.prank(operator);
        drop = factory.createDrop{ value: value }(CSV, NATIVE, root, TOTAL, startTime, deadline, address(0));
    }

    // -------------------------------------------------------------------

    function test_native_allowListSkipsContractCheck() public view {
        assertTrue(factory.isAllowed(NATIVE), "NATIVE allow-listed without code");
        assertEq(factory.NATIVE(), NATIVE, "sentinel matches");
    }

    function test_native_createFundsDropAndVault() public {
        uint256 fee = _fee();
        assertGt(fee, 0, "percent default fee");

        address drop = _createNative();

        assertEq(drop.balance, TOTAL, "drop funded with ETH");
        assertEq(address(factory).balance, fee, "vault retains fee in ETH");
        assertEq(factory.collectedFees(NATIVE), fee, "fee accounting");

        MerkleDrop md = MerkleDrop(payable(drop));
        assertTrue(md.isNative(), "isNative flag");
        assertEq(md.token(), NATIVE, "token sentinel");
        assertEq(md.operator(), operator, "operator");
    }

    function test_native_claimPaysEther() public {
        address drop = _createNative();

        vm.prank(claimer);
        MerkleDrop(payable(drop)).claim(0, claimer, AMT, new bytes32[](0));

        assertEq(claimer.balance, AMT, "claimer received ETH");
        assertEq(drop.balance, TOTAL - AMT, "drop debited");
        assertTrue(MerkleDrop(payable(drop)).isClaimed(0), "marked claimed");
    }

    function test_native_revertsOnWrongValue() public {
        uint256 value = TOTAL + _fee();
        vm.deal(operator, value);
        vm.prank(operator);
        vm.expectRevert(DropFactory.IncorrectValue.selector);
        // Underfunded by 1 wei.
        factory.createDrop{ value: value - 1 }(CSV, NATIVE, root, TOTAL, startTime, deadline, address(0));
    }

    function test_native_withdrawFeesSendsEther() public {
        _createNative();
        uint256 fee = _fee();

        vm.prank(admin);
        factory.withdrawFees(NATIVE, fee);

        assertEq(treasury.balance, fee, "treasury received ETH fee");
        assertEq(factory.collectedFees(NATIVE), 0, "vault drained");
        assertEq(address(factory).balance, 0, "no ETH left in factory");
    }

    function test_native_sweepReturnsEther() public {
        address drop = _createNative();

        vm.warp(deadline + 1);
        vm.prank(operator);
        MerkleDrop(payable(drop)).sweep();

        assertEq(drop.balance, 0, "drop swept");
        assertEq(operator.balance, TOTAL, "operator reclaimed unclaimed ETH");
    }
}
