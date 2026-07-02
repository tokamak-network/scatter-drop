// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DropFactory } from "../src/DropFactory.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockIdentityRegistry } from "./mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "./mocks/MockRegistryFactory.sol";
import { MerkleTestBase } from "./util/MerkleTestBase.sol";

/// @notice `DropFactory.publishProofs` — the operator records the IPFS CID of a
///         drop's `proofs.json` on-chain (event-only). Pure addition: no existing
///         path or state is touched.
contract ProofsPublishedTest is MerkleTestBase {
    DropFactory internal factory;
    MockIdentityRegistry internal opReg;
    MockRegistryFactory internal zkFactory;
    MockERC20 internal token;

    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal treasury = makeAddr("treasury");
    address internal stranger = makeAddr("stranger");

    uint8 internal constant CSV = uint8(DropFactory.AirdropType.CSV);
    uint256 internal constant TOTAL = 1_000 ether;
    string internal constant CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

    address internal drop;

    event ProofsPublished(address indexed drop, string cid);

    function setUp() public {
        opReg = new MockIdentityRegistry();
        zkFactory = new MockRegistryFactory();
        factory = _deployFactory(admin, address(opReg), zkFactory, treasury);
        token = new MockERC20("Mock", "MOCK", 18);

        vm.prank(admin);
        factory.setAllowedToken(address(token), true);
        opReg.setVerifiedUntil(operator, uint64(block.timestamp + 365 days));

        drop = _createDrop(factory);
    }

    /// @dev Create an open (no customer gate) ERC20 drop owned by `operator`.
    function _createDrop(DropFactory f) internal returns (address) {
        uint256 fee = f.feeOf(address(token), TOTAL);
        token.mint(operator, TOTAL + fee);
        bytes32 root = _leaf(0, operator, TOTAL);
        vm.startPrank(operator);
        token.approve(address(f), TOTAL + fee);
        address d = f.createDrop(
            CSV,
            address(token),
            root,
            TOTAL,
            uint64(block.timestamp),
            uint64(block.timestamp + 7 days),
            address(0)
        );
        vm.stopPrank();
        return d;
    }

    function test_publishProofs_operatorEmits() public {
        vm.expectEmit(true, false, false, true, address(factory));
        emit ProofsPublished(drop, CID);
        vm.prank(operator);
        factory.publishProofs(drop, CID);
    }

    function test_publishProofs_revertsForNonOperator() public {
        vm.prank(stranger);
        vm.expectRevert(DropFactory.NotDropOperator.selector);
        factory.publishProofs(drop, CID);
    }

    function test_publishProofs_revertsForEmptyCid() public {
        vm.prank(operator);
        vm.expectRevert(DropFactory.EmptyCid.selector);
        factory.publishProofs(drop, "");
    }

    function test_publishProofs_revertsForEoaDrop() public {
        vm.prank(operator);
        vm.expectRevert(DropFactory.UnknownDrop.selector);
        factory.publishProofs(makeAddr("notADrop"), CID);
    }

    function test_publishProofs_revertsForNonDropContract() public {
        // A contract with no `factory()` (e.g. the token) yields a clean UnknownDrop, not
        // an opaque decode revert.
        vm.prank(operator);
        vm.expectRevert(DropFactory.UnknownDrop.selector);
        factory.publishProofs(address(token), CID);
    }

    function test_publishProofs_revertsForForeignFactoryDrop() public {
        // A drop from a *different* factory reports a different `factory()`.
        DropFactory other = _deployFactory(admin, address(opReg), zkFactory, treasury);
        vm.prank(admin);
        other.setAllowedToken(address(token), true);
        address foreignDrop = _createDrop(other);

        vm.prank(operator);
        vm.expectRevert(DropFactory.UnknownDrop.selector);
        factory.publishProofs(foreignDrop, CID);
    }

    function test_publishProofs_republishAllowed() public {
        // Distinct, valid CIDv1 base32 (charset a-z2-7 only).
        string memory cid2 = "bafybeic5t7u3w4x6y7z2a3b4c5d6e7f2g3h4i5j6k7l2m3n4o5p6q7r2s3";

        vm.startPrank(operator);
        vm.expectEmit(true, false, false, true, address(factory));
        emit ProofsPublished(drop, CID);
        factory.publishProofs(drop, CID);

        // Re-publishing to a new CID is allowed; the latest event wins.
        vm.expectEmit(true, false, false, true, address(factory));
        emit ProofsPublished(drop, cid2);
        factory.publishProofs(drop, cid2);
        vm.stopPrank();
    }
}
