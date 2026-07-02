// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { LibClone } from "solady/utils/LibClone.sol";

import { MerkleDrop } from "../../src/MerkleDrop.sol";
import { DropFactory } from "../../src/DropFactory.sol";
import { IIdentityRegistry } from "../../src/interfaces/IIdentityRegistry.sol";
import { IRegistryFactoryLike } from "../../src/interfaces/IRegistryFactoryLike.sol";

/// @notice Shared Merkle helpers for contract tests. Leaf encoding and
///         sorted-pair hashing match the off-chain `packages/merkle` library
///         and the on-chain `MerkleDrop` verifier, so the single definition
///         here keeps every test in sync if the scheme ever changes.
abstract contract MerkleTestBase is Test {
    /// @dev Cached MerkleDrop logic contract; drops are minimal-proxy clones of it.
    address private _dropImpl;

    /// @dev leaf = keccak256(abi.encodePacked(uint256 index, address account, uint256 amount)).
    function _leaf(uint256 index, address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(index, account, amount));
    }

    /// @dev OpenZeppelin-compatible commutative (sorted-pair) node hash.
    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// @dev Deploy a MerkleDrop the way the factory does — a clone-with-immutable
    ///      -args (config abi.encoded into the clone's bytecode). `factory` arg =
    ///      this test contract, mirroring the factory's `address(this)`.
    function _newDrop(
        address token_,
        bytes32 root_,
        uint64 startTime_,
        uint64 deadline_,
        IIdentityRegistry registry_,
        address operator_
    ) internal returns (MerkleDrop drop) {
        if (_dropImpl == address(0)) _dropImpl = address(new MerkleDrop());
        bytes memory args =
            abi.encode(token_, root_, startTime_, deadline_, address(registry_), operator_, address(this));
        drop = MerkleDrop(payable(LibClone.clone(_dropImpl, args)));
    }

    /// @dev An uninitialized factory behind an ERC1967 (UUPS) proxy — for tests
    ///      that assert `initialize` reverts on bad args.
    function _deployFactoryProxy() internal returns (DropFactory) {
        address impl = address(new DropFactory());
        return DropFactory(LibClone.deployERC1967(impl));
    }

    /// @dev Deploy the factory behind an ERC1967 (UUPS) proxy + initialize it.
    function _deployFactory(
        address owner_,
        address operatorRegistry_,
        IRegistryFactoryLike zkFactory_,
        address treasury_
    ) internal returns (DropFactory factory) {
        factory = _deployFactoryProxy();
        factory.initialize(owner_, operatorRegistry_, zkFactory_, treasury_);
    }
}
