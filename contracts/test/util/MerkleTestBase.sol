// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";

/// @notice Shared Merkle helpers for contract tests. Leaf encoding and
///         sorted-pair hashing match the off-chain `packages/merkle` library
///         and the on-chain `MerkleDrop` verifier, so the single definition
///         here keeps every test in sync if the scheme ever changes.
abstract contract MerkleTestBase is Test {
    /// @dev leaf = keccak256(abi.encodePacked(uint256 index, address account, uint256 amount)).
    function _leaf(uint256 index, address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(index, account, amount));
    }

    /// @dev OpenZeppelin-compatible commutative (sorted-pair) node hash.
    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }
}
