// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DropFactory } from "../src/DropFactory.sol";
import { MerkleDrop } from "../src/MerkleDrop.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockIdentityRegistry } from "./mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "./mocks/MockRegistryFactory.sol";
import { MerkleTestBase } from "./util/MerkleTestBase.sol";

/// @notice Gas snapshot for the post-W13 delta (native ETH + proofs CID) vs the
///         ERC20 baseline, feeding the regression table in docs/SECURITY.md §7.3.
///         Measures the outer-call gas of each op with `gasleft()`. Informational —
///         run `forge test --match-contract GasSnapshotTest -vv` to print the table.
contract GasSnapshotTest is MerkleTestBase {
    DropFactory internal factory;
    MockIdentityRegistry internal opReg;
    MockRegistryFactory internal zkFactory;
    MockERC20 internal token;

    address internal constant NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal treasury = makeAddr("treasury");
    address internal claimer = makeAddr("claimer");

    uint8 internal constant CSV = uint8(DropFactory.AirdropType.CSV);
    uint256 internal constant TOTAL = 10 ether;
    uint256 internal constant AMT = 3 ether;
    string internal constant CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

    uint64 internal startTime;
    uint64 internal deadline;
    bytes32 internal root; // single-leaf tree: root == leaf, empty proof

    function setUp() public {
        opReg = new MockIdentityRegistry();
        zkFactory = new MockRegistryFactory();
        factory = new DropFactory(admin, address(opReg), zkFactory, treasury);
        token = new MockERC20("Mock", "MOCK", 18);

        vm.startPrank(admin);
        factory.setAllowedToken(address(token), true);
        factory.setAllowedToken(NATIVE, true);
        vm.stopPrank();

        opReg.setVerifiedUntil(operator, uint64(block.timestamp + 365 days));
        startTime = uint64(block.timestamp);
        deadline = uint64(block.timestamp + 7 days);
        root = _leaf(0, claimer, AMT);
    }

    /// @dev Prints the gas regression table. Each number is the outer-call gas.
    function test_gasSnapshot() public {
        // --- createDrop (deploys a MerkleDrop) ---
        uint256 feeErc20 = factory.feeOf(address(token), TOTAL);
        token.mint(operator, TOTAL + feeErc20);
        vm.startPrank(operator);
        token.approve(address(factory), TOTAL + feeErc20);
        uint256 g = gasleft();
        address dErc20 = factory.createDrop(CSV, address(token), root, TOTAL, startTime, deadline, address(0));
        uint256 createErc20 = g - gasleft();
        vm.stopPrank();

        uint256 valueN = TOTAL + factory.feeOf(NATIVE, TOTAL);
        vm.deal(operator, valueN);
        vm.prank(operator);
        g = gasleft();
        address dNative =
            factory.createDrop{ value: valueN }(CSV, NATIVE, root, TOTAL, startTime, deadline, address(0));
        uint256 createNative = g - gasleft();

        // --- claim ---
        vm.prank(claimer);
        g = gasleft();
        MerkleDrop(payable(dErc20)).claim(0, claimer, AMT, new bytes32[](0));
        uint256 claimErc20 = g - gasleft();

        vm.prank(claimer);
        g = gasleft();
        MerkleDrop(payable(dNative)).claim(0, claimer, AMT, new bytes32[](0));
        uint256 claimNative = g - gasleft();

        // --- publishProofs (event-only) ---
        vm.prank(operator);
        g = gasleft();
        factory.publishProofs(dErc20, CID);
        uint256 publish = g - gasleft();

        // --- sweep (after the deadline) ---
        vm.warp(deadline + 1);
        vm.prank(operator);
        g = gasleft();
        MerkleDrop(payable(dErc20)).sweep();
        uint256 sweepErc20 = g - gasleft();

        vm.prank(operator);
        g = gasleft();
        MerkleDrop(payable(dNative)).sweep();
        uint256 sweepNative = g - gasleft();

        emit log_string("--- gas snapshot (outer-call gas) ---");
        emit log_named_uint("createDrop ERC20 ", createErc20);
        emit log_named_uint("createDrop NATIVE", createNative);
        emit log_named_uint("claim      ERC20 ", claimErc20);
        emit log_named_uint("claim      NATIVE", claimNative);
        emit log_named_uint("sweep      ERC20 ", sweepErc20);
        emit log_named_uint("sweep      NATIVE", sweepNative);
        emit log_named_uint("publishProofs    ", publish);
    }
}
