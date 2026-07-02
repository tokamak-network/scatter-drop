// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DropFactory } from "../src/DropFactory.sol";
import { MerkleDrop } from "../src/MerkleDrop.sol";
import { IRegistryFactoryLike } from "../src/interfaces/IRegistryFactoryLike.sol";

import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockIdentityRegistry } from "./mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "./mocks/MockRegistryFactory.sol";
import { MerkleTestBase } from "./util/MerkleTestBase.sol";

/// @notice End-to-end (M3) integration across the full scatter-drop stack with
///         mocked zk-X509: operator creates a campaign through `DropFactory` (paying
///         the on-top creation fee in the airdrop token), an identity-verified
///         customer claims through the deployed `MerkleDrop`, the operator sweeps
///         the remainder, and the admin withdraws accrued fees to the fixed treasury.
contract E2ETest is MerkleTestBase {
    uint8 internal constant CSV = 0;

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

    uint256 internal constant FEE = 10 ether; // flat fee in the airdrop token
    uint256 internal constant CUSTOMER_AMT = 1000 ether;
    uint256 internal constant OTHER_AMT = 500 ether;
    uint256 internal constant TOTAL = CUSTOMER_AMT + OTHER_AMT;

    uint64 internal startTime;
    uint64 internal deadline;
    bytes32 internal root;
    bytes32[] internal customerProof; // proof for leaf index 0 (customer)

    function setUp() public {
        vm.warp(1_000_000);
        startTime = uint64(block.timestamp);
        deadline = uint64(block.timestamp + 30 days);

        airdropToken = new MockERC20("Drop", "DROP", 18);
        operatorRegistry = new MockIdentityRegistry();
        customerRegistry = new MockIdentityRegistry();
        zkFactory = new MockRegistryFactory();
        zkFactory.setRegistry(address(customerRegistry), true);

        vm.prank(admin);
        factory = _deployFactory(
            admin, address(operatorRegistry), IRegistryFactoryLike(address(zkFactory)), treasury
        );
        vm.startPrank(admin);
        factory.setAllowedToken(address(airdropToken), true); // curate the airdrop token
        factory.setFeeMode(address(airdropToken), DropFactory.FeeMode.FLAT);
        factory.setFlatFee(address(airdropToken), FEE);
        vm.stopPrank();

        // Identity-verify the operator (gate 1) and the customer (gate 2).
        operatorRegistry.setVerifiedUntil(operator, type(uint64).max);
        customerRegistry.setVerifiedUntil(customer, type(uint64).max);

        // Fund the operator with the distribution + on-top fee (same token).
        airdropToken.mint(operator, TOTAL + FEE);

        // Build the allocation tree: leaf0 = customer, leaf1 = other.
        bytes32 leaf0 = _leaf(0, customer, CUSTOMER_AMT);
        bytes32 leaf1 = _leaf(1, other, OTHER_AMT);
        root = _hashPair(leaf0, leaf1);
        customerProof = [leaf1];
    }

    /// @dev Operator approves `TOTAL + FEE` and creates the campaign.
    function _createDrop() internal returns (MerkleDrop drop) {
        vm.startPrank(operator);
        airdropToken.approve(address(factory), TOTAL + FEE);
        drop = MerkleDrop(
            payable(
                factory.createDrop(
                    CSV, address(airdropToken), root, TOTAL, startTime, deadline, address(customerRegistry)
                )
            )
        );
        vm.stopPrank();
    }

    function test_E2E_CreateClaimSweepWithdraw() public {
        MerkleDrop drop = _createDrop();

        // Factory funded the drop with the full TOTAL and accrued the on-top fee.
        assertEq(address(drop.token()), address(airdropToken));
        assertEq(drop.operator(), operator);
        assertEq(drop.merkleRoot(), root);
        assertEq(airdropToken.balanceOf(address(drop)), TOTAL);
        assertEq(airdropToken.balanceOf(address(factory)), FEE);
        assertEq(factory.collectedFees(address(airdropToken)), FEE);

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
        factory.withdrawFees(address(airdropToken), FEE);
        assertEq(airdropToken.balanceOf(treasury), FEE);
        assertEq(factory.collectedFees(address(airdropToken)), 0);
    }

    /// @dev A campaign that opens in the future: claims revert until startTime,
    ///      then succeed once the window opens.
    function test_E2E_FutureStart_ClaimWindow() public {
        uint64 futureStart = uint64(block.timestamp + 1 days);

        vm.startPrank(operator);
        airdropToken.approve(address(factory), TOTAL + FEE);
        MerkleDrop drop = MerkleDrop(
            payable(
                factory.createDrop(
                    CSV, address(airdropToken), root, TOTAL, futureStart, deadline, address(customerRegistry)
                )
            )
        );
        vm.stopPrank();

        assertEq(drop.startTime(), futureStart);

        vm.prank(customer);
        vm.expectRevert(MerkleDrop.ClaimNotStarted.selector);
        drop.claim(0, customer, CUSTOMER_AMT, customerProof);

        vm.warp(futureStart);
        vm.prank(customer);
        drop.claim(0, customer, CUSTOMER_AMT, customerProof);
        assertEq(airdropToken.balanceOf(customer), CUSTOMER_AMT);
        assertTrue(drop.isClaimed(0));
    }

    function test_E2E_RevertUnverifiedOperator() public {
        address rogue = makeAddr("rogue");
        vm.prank(rogue);
        vm.expectRevert(DropFactory.OperatorNotVerified.selector);
        factory.createDrop(
            CSV, address(airdropToken), root, TOTAL, startTime, deadline, address(customerRegistry)
        );
    }

    function test_E2E_RevertNonStandardRegistry() public {
        MockIdentityRegistry rogueRegistry = new MockIdentityRegistry();
        vm.prank(operator);
        vm.expectRevert(DropFactory.NotAStandardRegistry.selector);
        factory.createDrop(
            CSV, address(airdropToken), root, TOTAL, startTime, deadline, address(rogueRegistry)
        );
    }

    function test_E2E_RevertUnverifiedCustomerClaim() public {
        MerkleDrop drop = _createDrop();
        bytes32[] memory otherProof = new bytes32[](1);
        otherProof[0] = _leaf(0, customer, CUSTOMER_AMT);
        vm.prank(other);
        vm.expectRevert(MerkleDrop.NotVerified.selector);
        drop.claim(1, other, OTHER_AMT, otherProof);
    }
}
