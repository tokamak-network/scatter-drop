// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IRegistryFactoryLike
/// @notice Minimal read-only view of the zk-X509 RegistryFactory used to confirm
///         that a customer `identityRegistry` was issued by the canonical factory.
/// @dev    Seam ② (frozen by K0). Implemented by zk-X509 `RegistryFactory`; mocked in tests.
interface IRegistryFactoryLike {
    /// @notice True if `registry` is a genuine IdentityRegistry deployed by this factory.
    function isRegistry(address registry) external view returns (bool);
}
