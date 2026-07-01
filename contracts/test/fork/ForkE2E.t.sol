// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DropFactory } from "../../src/DropFactory.sol";
import { MerkleDrop } from "../../src/MerkleDrop.sol";
import { IIdentityRegistry } from "../../src/interfaces/IIdentityRegistry.sol";
import { IRegistryFactoryLike } from "../../src/interfaces/IRegistryFactoryLike.sol";

import { MockERC20 } from "../mocks/MockERC20.sol";
import { MerkleTestBase } from "../util/MerkleTestBase.sol";

/// @notice End-to-end against the REAL zk-X509 deployment on a Sepolia fork
///         (W5b / M3). The registry-factory gate (`isRegistry`) runs against
///         the live `RegistryFactory`; identity verification (`verifiedUntil`)
///         is overridden with `vm.mockCall` because producing a real zk proof
///         on a fork is impractical — this keeps the override independent of
///         the registry's (proxy) storage layout.
///
/// @dev Requires `SEPOLIA_RPC_URL` (sourced from `contracts/.env`). When it is
///      unset the tests skip, so the default `forge test` stays hermetic.
///      Run explicitly:
///        source contracts/.env && forge test --root contracts \
///          --match-path "test/fork/ForkE2E.t.sol" -vv
contract ForkE2ETest is MerkleTestBase {
    // Real zk-X509 on Sepolia (chainId 11155111).
    address internal constant ZK_FACTORY = 0x9e937dF6ac0E85979622519068412A518fa085d9;
    address internal constant USERS_REGISTRY = 0x3cF6A96f1970053ffDf957074F988aD53D13ada3;

    uint8 internal constant CSV = 0;
    uint256 internal constant FEE = 10 ether;
    uint256 internal constant CUSTOMER_AMT = 1000 ether;
    uint256 internal constant OTHER_AMT = 500 ether;
    uint256 internal constant TOTAL = CUSTOMER_AMT + OTHER_AMT;

    bool internal forked;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal operator = makeAddr("operator");
    address internal customer = makeAddr("customer");
    address internal other = makeAddr("other");

    function setUp() public {
        string memory url = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(url).length == 0) return; // skip when no RPC configured
        vm.createSelectFork(url);
        forked = true;
    }

    /// @dev The live RegistryFactory must recognise the users IdentityRegistry,
    ///      otherwise `createDrop` would revert `NotAStandardRegistry`.
    function test_Fork_RealRegistryIsRecognised() public {
        if (!forked) {
            vm.skip(true);
            return;
        }
        assertTrue(IRegistryFactoryLike(ZK_FACTORY).isRegistry(USERS_REGISTRY));
    }

    function test_Fork_FullFlow() public {
        if (!forked) {
            vm.skip(true);
            return;
        }

        // Override identity verification for the two participants (gate 1 reads
        // operator, gate 2 reads customer); everything else hits the real chain.
        _verify(operator);
        _verify(customer);

        // Deploy the local pieces on top of the fork: tokens + factory wired to
        // the real registry factory and users registry.
        MockERC20 airdropToken = new MockERC20("Drop", "DROP", 18);

        vm.prank(admin);
        DropFactory factory =
            new DropFactory(admin, USERS_REGISTRY, IRegistryFactoryLike(ZK_FACTORY), treasury);
        vm.startPrank(admin);
        factory.setAllowedToken(address(airdropToken), true); // curate the airdrop token
        factory.setFeeMode(address(airdropToken), DropFactory.FeeMode.FLAT);
        factory.setFlatFee(address(airdropToken), FEE);
        vm.stopPrank();

        // On-top fee in the airdrop token: operator funds TOTAL + FEE.
        airdropToken.mint(operator, TOTAL + FEE);

        // Allocation tree: leaf0 = customer, leaf1 = other. leaf0 is inlined to
        // keep the stack shallow (this fork test is near the local-var limit).
        bytes32 leaf1 = _leaf(1, other, OTHER_AMT);
        bytes32 root = _hashPair(_leaf(0, customer, CUSTOMER_AMT), leaf1);

        // deadline comfortably past any MIN_DURATION gate.
        uint64 deadline = uint64(block.timestamp + 30 days);

        // Operator creates the campaign — gate 1 (mocked verified) + real
        // isRegistry both pass.
        vm.startPrank(operator);
        airdropToken.approve(address(factory), TOTAL + FEE);
        MerkleDrop drop = MerkleDrop(
            payable(
                factory.createDrop(
                    CSV, address(airdropToken), root, TOTAL, uint64(block.timestamp), deadline, USERS_REGISTRY
                )
            )
        );
        vm.stopPrank();

        assertEq(airdropToken.balanceOf(address(drop)), TOTAL);
        assertEq(factory.collectedFees(address(airdropToken)), FEE);

        // Customer claims — gate 2 (mocked verified) passes.
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        vm.prank(customer);
        drop.claim(0, customer, CUSTOMER_AMT, proof);
        assertEq(airdropToken.balanceOf(customer), CUSTOMER_AMT);
        assertTrue(drop.isClaimed(0));

        // Operator sweeps the remainder after the deadline.
        vm.warp(deadline + 1);
        vm.prank(operator);
        drop.sweep();
        assertEq(airdropToken.balanceOf(operator), OTHER_AMT);
        assertEq(airdropToken.balanceOf(address(drop)), 0);

        // Admin withdraws the accrued fee (in the airdrop token) to the fixed treasury.
        vm.prank(admin);
        factory.withdrawFees(address(airdropToken), FEE);
        assertEq(airdropToken.balanceOf(treasury), FEE);
    }

    /// @dev Make `account` appear verified far into the future on the real
    ///      registry, without a zk proof, by mocking its `verifiedUntil` view.
    function _verify(address account) internal {
        vm.mockCall(
            USERS_REGISTRY,
            abi.encodeWithSelector(IIdentityRegistry.verifiedUntil.selector, account),
            abi.encode(type(uint64).max)
        );
    }
}
