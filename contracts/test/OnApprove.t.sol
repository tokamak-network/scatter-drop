// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MerkleTestBase } from "./util/MerkleTestBase.sol";
import { DropFactory } from "../src/DropFactory.sol";
import { MerkleDrop } from "../src/MerkleDrop.sol";
import { IRegistryFactoryLike } from "../src/interfaces/IRegistryFactoryLike.sol";
import { MockSeigToken } from "./mocks/MockSeigToken.sol";
import { MockReentrantToken } from "./mocks/MockReentrantToken.sol";
import { MockIdentityRegistry } from "./mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "./mocks/MockRegistryFactory.sol";
import { ReentrancyGuard } from "solady/utils/ReentrancyGuard.sol";

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

    // --- Admin-curated approveAndCall capability flag ---

    function test_setApproveAndCallSupport_setsFlag() public {
        assertFalse(factory.supportsApproveAndCall(address(ton)), "default false");
        vm.prank(admin);
        factory.setApproveAndCallSupport(address(ton), true);
        assertTrue(factory.supportsApproveAndCall(address(ton)), "set true");
        vm.prank(admin);
        factory.setApproveAndCallSupport(address(ton), false);
        assertFalse(factory.supportsApproveAndCall(address(ton)), "cleared");
    }

    function test_setApproveAndCallSupport_onlyOwner() public {
        vm.prank(operator); // not the owner
        vm.expectRevert();
        factory.setApproveAndCallSupport(address(ton), true);
    }

    // --- DropParams ABI surface (#2 drift guard) ---

    function test_encodeDropParams_matchesOnApproveData() public view {
        DropFactory.DropParams memory p =
            DropFactory.DropParams(uint8(DropFactory.AirdropType.CSV), ROOT, TOTAL, startTime, deadline, address(0));
        // The on-chain encoder equals both abi.encode(p) and the blob onApprove decodes.
        assertEq(factory.encodeDropParams(p), abi.encode(p));
        assertEq(factory.encodeDropParams(p), _data());
    }

    // --- Reentrancy guard (defense-in-depth) ---

    function test_createDrop_reentrancyBlocked() public {
        // A token that reenters createDrop while the factory pulls funds must abort.
        MockReentrantToken evil = new MockReentrantToken();
        vm.prank(admin);
        factory.setAllowedToken(address(evil), true);
        uint256 fee = factory.feeOf(address(evil), TOTAL);
        evil.mint(operator, TOTAL + fee);
        vm.prank(operator);
        evil.approve(address(factory), TOTAL + fee);
        evil.arm(factory); // reenter on the next transferFrom

        vm.prank(operator);
        vm.expectRevert(ReentrancyGuard.Reentrancy.selector);
        factory.createDrop(
            uint8(DropFactory.AirdropType.CSV), address(evil), ROOT, TOTAL, startTime, deadline, address(0)
        );
    }

    function test_onApprove_reentrancyBlocked() public {
        // Same guard on the one-tx path: onApprove's fund pull hits the armed
        // transferFrom, which reenters createDrop and must abort the whole tx.
        MockReentrantToken evil = new MockReentrantToken();
        vm.prank(admin);
        factory.setAllowedToken(address(evil), true);
        uint256 fee = factory.feeOf(address(evil), TOTAL);
        evil.mint(operator, TOTAL + fee);
        evil.arm(factory); // reenter on the next transferFrom

        vm.prank(operator);
        vm.expectRevert(ReentrancyGuard.Reentrancy.selector);
        evil.approveAndCall(address(factory), TOTAL + fee, _data());
    }
}
