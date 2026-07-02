// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MerkleTestBase } from "./util/MerkleTestBase.sol";
import { DropFactory } from "../src/DropFactory.sol";
import { MerkleDrop } from "../src/MerkleDrop.sol";
import { IRegistryFactoryLike } from "../src/interfaces/IRegistryFactoryLike.sol";
import { MockSeigToken } from "./mocks/MockSeigToken.sol";
import { MockIdentityRegistry } from "./mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "./mocks/MockRegistryFactory.sol";

/// @notice The TON/SeigToken one-tx path: `approveAndCall(factory, total+fee, data)`
///         → `factory.onApprove(...)` creates + funds the drop in a single tx, and
///         the pull-to-factory → push-to-drop funding works for a token whose
///         `transferFrom` is restricted to caller ∈ {from, to}.
contract OnApproveTest is MerkleTestBase {
    DropFactory internal factory;
    MockSeigToken internal ton; // transferFrom restricted like Tokamak TON
    MockIdentityRegistry internal opReg;
    MockRegistryFactory internal zkFactory;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal treasury = makeAddr("treasury");

    bytes32 internal constant ROOT = keccak256("root");
    uint256 internal constant TOTAL = 1_000 ether;

    uint64 internal startTime;
    uint64 internal deadline;

    function setUp() public {
        ton = new MockSeigToken("Tokamak", "TON", 18);
        opReg = new MockIdentityRegistry();
        zkFactory = new MockRegistryFactory();

        factory = _deployFactory(admin, address(opReg), zkFactory, treasury);
        vm.prank(admin);
        factory.setAllowedToken(address(ton), true);

        opReg.setVerifiedUntil(operator, uint64(block.timestamp + 365 days));
        startTime = uint64(block.timestamp);
        deadline = uint64(block.timestamp + 7 days);
    }

    function _data() internal view returns (bytes memory) {
        // Open claim (identityRegistry = 0) keeps the fixture minimal. Encoded as the
        // DropParams struct — the exact layout onApprove decodes.
        return abi.encode(
            DropFactory.DropParams(uint8(DropFactory.AirdropType.CSV), ROOT, TOTAL, startTime, deadline, address(0))
        );
    }

    // A restricted-transferFrom token can't be funded via the 2-step createDrop
    // path (the factory is neither `from` nor `to` when pulling straight to the
    // drop... but our B-flow pulls to the factory first, so it DOES work):
    function test_createDrop_worksForRestrictedTransferFrom() public {
        uint256 fee = factory.feeOf(address(ton), TOTAL);
        ton.mint(operator, TOTAL + fee);
        vm.prank(operator);
        ton.approve(address(factory), TOTAL + fee);

        vm.prank(operator);
        address drop = factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(ton), ROOT, TOTAL, startTime, deadline, address(0)
        );

        assertEq(ton.balanceOf(drop), TOTAL, "drop funded with total");
        assertEq(ton.balanceOf(address(factory)), fee, "factory nets exactly the fee");
        assertEq(ton.balanceOf(operator), 0, "operator paid total + fee");
    }

    function test_onApprove_createsDropInOneTx() public {
        uint256 fee = factory.feeOf(address(ton), TOTAL);
        ton.mint(operator, TOTAL + fee);

        // Single operator transaction: approveAndCall → onApprove → create + fund.
        vm.prank(operator);
        ton.approveAndCall(address(factory), TOTAL + fee, _data());

        assertEq(factory.dropsLength(), 1, "one drop created");
        address drop = factory.dropAt(0);
        MerkleDrop md = MerkleDrop(payable(drop));
        assertEq(md.operator(), operator, "operator is the approver");
        assertEq(address(md.token()), address(ton), "token is the caller");
        assertEq(md.merkleRoot(), ROOT);
        assertEq(ton.balanceOf(drop), TOTAL, "drop funded with total");
        assertEq(ton.balanceOf(address(factory)), fee, "factory nets exactly the fee");
        assertEq(ton.balanceOf(operator), 0, "operator paid total + fee");
    }

    function test_onApprove_revertsWrongSpender() public {
        // Called with a spender other than the factory (e.g. a spoofed callback).
        vm.expectRevert(DropFactory.InvalidAddress.selector);
        factory.onApprove(operator, address(0xBEEF), TOTAL, _data());
    }

    function test_onApprove_revertsAmountMismatch() public {
        uint256 fee = factory.feeOf(address(ton), TOTAL);
        ton.mint(operator, TOTAL + fee);
        // Approve less than total + fee → onApprove rejects on the amount check.
        vm.prank(operator);
        vm.expectRevert(DropFactory.IncorrectValue.selector);
        ton.approveAndCall(address(factory), TOTAL, _data());
    }

    function test_onApprove_revertsUnverifiedOperator() public {
        address stranger = makeAddr("stranger"); // not verified
        uint256 fee = factory.feeOf(address(ton), TOTAL);
        ton.mint(stranger, TOTAL + fee);
        vm.prank(stranger);
        vm.expectRevert(DropFactory.OperatorNotVerified.selector);
        ton.approveAndCall(address(factory), TOTAL + fee, _data());
    }
}
