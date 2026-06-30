// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IIdentityRegistry
/// @notice Minimal read-only view of a zk-X509 IdentityRegistry.
/// @dev Returns the unix timestamp until which `account` is identity-verified.
///      A value `>= block.timestamp` means the account is currently verified.
interface IIdentityRegistry {
    /// @notice Timestamp (unix seconds) until which `account` stays verified.
    /// @param account Wallet whose verification status is queried.
    /// @return The expiry timestamp; `0` if never verified.
    function verifiedUntil(address account) external view returns (uint64);
}
