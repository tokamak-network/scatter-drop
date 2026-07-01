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
/// @dev Each op is measured in **its own test** (a fresh `setUp`, i.e. a separate
///      transaction) so cross-op EIP-2929 warm-access doesn't skew the ERC20-vs-native
///      comparison — each pair is measured under the same warmth profile. Numbers are the
///      outer-call gas via `gasleft()`. Run `forge test --match-contract GasSnapshotTest -vv`.
contract GasSnapshotTest is MerkleTestBase {
    DropFactory internal factory;
    MockIdentityRegistry internal opReg;
    MockRegistryFactory internal zkFactory;
    MockERC20 internal token;

    // Read from the deployed factory (set in setUp) so the sentinel can't drift from production.
    address internal NATIVE;

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
        NATIVE = factory.NATIVE();

        vm.startPrank(admin);
        factory.setAllowedToken(address(token), true);
        factory.setAllowedToken(NATIVE, true);
        vm.stopPrank();

        opReg.setVerifiedUntil(operator, uint64(block.timestamp + 365 days));
        startTime = uint64(block.timestamp);
        deadline = uint64(block.timestamp + 7 days);
        root = _leaf(0, claimer, AMT);
    }

    function _createErc20() internal returns (address) {
        uint256 fee = factory.feeOf(address(token), TOTAL);
        token.mint(operator, TOTAL + fee);
        vm.startPrank(operator);
        token.approve(address(factory), TOTAL + fee);
        address d = factory.createDrop(CSV, address(token), root, TOTAL, startTime, deadline, address(0));
        vm.stopPrank();
        return d;
    }

    function _createNative() internal returns (address) {
        uint256 value = TOTAL + factory.feeOf(NATIVE, TOTAL);
        vm.deal(operator, value);
        vm.prank(operator);
        return factory.createDrop{ value: value }(CSV, NATIVE, root, TOTAL, startTime, deadline, address(0));
    }

    // --- createDrop (deploys a MerkleDrop) ---

    function test_gas_createDrop_erc20() public {
        uint256 fee = factory.feeOf(address(token), TOTAL);
        token.mint(operator, TOTAL + fee);
        vm.startPrank(operator);
        token.approve(address(factory), TOTAL + fee);
        uint256 g = gasleft();
        factory.createDrop(CSV, address(token), root, TOTAL, startTime, deadline, address(0));
        emit log_named_uint("createDrop ERC20 ", g - gasleft());
        vm.stopPrank();
    }

    function test_gas_createDrop_native() public {
        uint256 value = TOTAL + factory.feeOf(NATIVE, TOTAL);
        vm.deal(operator, value);
        vm.prank(operator);
        uint256 g = gasleft();
        factory.createDrop{ value: value }(CSV, NATIVE, root, TOTAL, startTime, deadline, address(0));
        emit log_named_uint("createDrop NATIVE", g - gasleft());
    }

    // --- claim ---

    function test_gas_claim_erc20() public {
        MerkleDrop d = MerkleDrop(payable(_createErc20()));
        vm.prank(claimer);
        uint256 g = gasleft();
        d.claim(0, claimer, AMT, new bytes32[](0));
        emit log_named_uint("claim ERC20 ", g - gasleft());
    }

    function test_gas_claim_native() public {
        MerkleDrop d = MerkleDrop(payable(_createNative()));
        vm.prank(claimer);
        uint256 g = gasleft();
        d.claim(0, claimer, AMT, new bytes32[](0));
        emit log_named_uint("claim NATIVE", g - gasleft());
    }

    // --- sweep (after the deadline) ---

    function test_gas_sweep_erc20() public {
        MerkleDrop d = MerkleDrop(payable(_createErc20()));
        vm.warp(deadline + 1);
        vm.prank(operator);
        uint256 g = gasleft();
        d.sweep();
        emit log_named_uint("sweep ERC20 ", g - gasleft());
    }

    function test_gas_sweep_native() public {
        MerkleDrop d = MerkleDrop(payable(_createNative()));
        vm.warp(deadline + 1);
        vm.prank(operator);
        uint256 g = gasleft();
        d.sweep();
        emit log_named_uint("sweep NATIVE", g - gasleft());
    }

    // --- publishProofs (event-only) ---

    function test_gas_publishProofs() public {
        address d = _createErc20();
        vm.prank(operator);
        uint256 g = gasleft();
        factory.publishProofs(d, CID);
        emit log_named_uint("publishProofs", g - gasleft());
    }
}
