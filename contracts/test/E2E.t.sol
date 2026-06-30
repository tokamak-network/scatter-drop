// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DropFactory } from "../src/DropFactory.sol";
import { MerkleDrop } from "../src/MerkleDrop.sol";
import { IIdentityRegistry } from "../src/interfaces/IIdentityRegistry.sol";
import { IRegistryFactoryLike } from "../src/interfaces/IRegistryFactoryLike.sol";

import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockIdentityRegistry } from "./mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "./mocks/MockRegistryFactory.sol";
import { MerkleTestBase } from "./util/MerkleTestBase.sol";

/// @notice End-to-end (M3) integration across the full scatter-drop stack with
///         mocked zk-X509: operator creates a campaign through `DropFactory`,
///         an identity-verified customer claims through the deployed
///         `MerkleDrop`, the operator sweeps the remainder, and the admin
///         withdraws accrued fees to the fixed treasury. This is the in-VM
///         behavioral assertion of the same path the `DeployLocal` script
///         stands up on a live anvil node for the SDK/frontend harness.
contract E2ETest is MerkleTestBase {
    uint8 internal constant CSV = 0;

    MockERC20 internal feeToken;
    MockERC20 internal airdropToken;
    MockIdentityRegistry internal operatorRegistry;
    MockIdentityRegistry internal customerRegistry;
    MockRegistryFactory internal zkFactory;
    DropFactory internal factory;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal operator = makeAddr("operator");
    address internal customer = makeAddr("customer");
    address internal other = makeAddr("other"); // second allocation, never claims

    uint256 internal constant FEE = 10 ether;
    uint256 internal constant CUSTOMER_AMT = 1000 ether;
    uint256 internal constant OTHER_AMT = 500 ether;
    uint256 internal constant TOTAL = CUSTOMER_AMT + OTHER_AMT;

    uint64 internal deadline;
    bytes32 internal root;
    bytes32[] internal customerProof; // proof for leaf index 0 (customer)

    function setUp() public {
        vm.warp(1_000_000);
        deadline = uint64(block.timestamp + 30 days);

        feeToken = new MockERC20("Fee", "FEE", 18);
        airdropToken = new MockERC20("Drop", "DROP", 18);
        operatorRegistry = new MockIdentityRegistry();
        customerRegistry = new MockIdentityRegistry();
        zkFactory = new MockRegistryFactory();
        zkFactory.setRegistry(address(customerRegistry), true);

        vm.prank(admin);
        factory = new DropFactory(
            admin, address(operatorRegistry), IRegistryFactoryLike(address(zkFactory)), treasury
        );
        vm.startPrank(admin);
        factory.setFee(address(feeToken), CSV, FEE);
        factory.setOfficialToken(address(airdropToken), true); // register the airdrop token
        vm.stopPrank();

        // Identity-verify the operator (gate 1) and the customer (gate 2).
        operatorRegistry.setVerifiedUntil(operator, type(uint64).max);
        customerRegistry.setVerifiedUntil(customer, type(uint64).max);

        // Fund the operator with fee + tokens to distribute.
        feeToken.mint(operator, FEE);
        airdropToken.mint(operator, TOTAL);

        // Build the allocation tree: leaf0 = customer, leaf1 = other.
        bytes32 leaf0 = _leaf(0, customer, CUSTOMER_AMT);
        bytes32 leaf1 = _leaf(1, other, OTHER_AMT);
        root = _hashPair(leaf0, leaf1);
        customerProof = [leaf1];
    }

    /// @dev Operator approves the factory and creates the campaign.
    function _createDrop() internal returns (MerkleDrop drop) {
        vm.startPrank(operator);
        feeToken.approve(address(factory), FEE);
        airdropToken.approve(address(factory), TOTAL);
        drop = MerkleDrop(
            factory.createDrop(
                CSV,
                address(airdropToken),
                root,
                TOTAL,
                deadline,
                address(customerRegistry),
                address(feeToken)
            )
        );
        vm.stopPrank();
    }

    function test_E2E_CreateClaimSweepWithdraw() public {
        MerkleDrop drop = _createDrop();

        // Factory wired the drop correctly and funded it; fee went to the vault.
        assertEq(address(drop.token()), address(airdropToken));
        assertEq(drop.operator(), operator);
        assertEq(drop.merkleRoot(), root);
        assertEq(airdropToken.balanceOf(address(drop)), TOTAL);
        assertEq(feeToken.balanceOf(address(factory)), FEE);
        assertEq(factory.collectedFees(address(feeToken)), FEE);

        // Verified customer claims their allocation.
        vm.prank(customer);
        drop.claim(0, customer, CUSTOMER_AMT, customerProof);
        assertEq(airdropToken.balanceOf(customer), CUSTOMER_AMT);
        assertTrue(drop.isClaimed(0));
        assertEq(airdropToken.balanceOf(address(drop)), OTHER_AMT);

        // After the deadline the operator sweeps the unclaimed remainder.
        vm.warp(deadline + 1);
        vm.prank(operator);
        drop.sweep();
        assertEq(airdropToken.balanceOf(operator), OTHER_AMT);
        assertEq(airdropToken.balanceOf(address(drop)), 0);

        // Admin withdraws accrued fees to the fixed treasury.
        vm.prank(admin);
        factory.withdrawFees(address(feeToken), FEE);
        assertEq(feeToken.balanceOf(treasury), FEE);
        assertEq(factory.collectedFees(address(feeToken)), 0);
    }

    function test_E2E_RevertUnverifiedOperator() public {
        // Gate 1 reverts on identity before any fee/token is pulled, so no
        // funding or approvals are needed here.
        address rogue = makeAddr("rogue");
        vm.prank(rogue);
        vm.expectRevert(DropFactory.OperatorNotVerified.selector);
        factory.createDrop(
            CSV, address(airdropToken), root, TOTAL, deadline, address(customerRegistry), address(feeToken)
        );
    }

    function test_E2E_RevertNonStandardRegistry() public {
        // The registry check reverts before any token is pulled, so the
        // operator's setUp funding is irrelevant and no approvals are needed.
        MockIdentityRegistry rogueRegistry = new MockIdentityRegistry();
        vm.prank(operator);
        vm.expectRevert(DropFactory.NotAStandardRegistry.selector);
        factory.createDrop(
            CSV, address(airdropToken), root, TOTAL, deadline, address(rogueRegistry), address(feeToken)
        );
    }

    function test_E2E_RevertUnverifiedCustomerClaim() public {
        MerkleDrop drop = _createDrop();
        // `other` holds a valid allocation/proof but is not identity-verified.
        bytes32[] memory otherProof = new bytes32[](1);
        otherProof[0] = _leaf(0, customer, CUSTOMER_AMT);
        vm.prank(other);
        vm.expectRevert(MerkleDrop.NotVerified.selector);
        drop.claim(1, other, OTHER_AMT, otherProof);
    }
}
