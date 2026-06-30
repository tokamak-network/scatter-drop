// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IRegistryFactoryLike } from "../../src/interfaces/IRegistryFactoryLike.sol";

/// @title MockRegistryFactory
/// @notice Test double for the zk-X509 RegistryFactory. Lets tests mark arbitrary
///         addresses as genuine IdentityRegistries.
contract MockRegistryFactory is IRegistryFactoryLike {
    mapping(address => bool) private _registries;

    /// @notice Toggle whether `registry` is recognized as a genuine registry.
    function setRegistry(address registry, bool ok) external {
        _registries[registry] = ok;
    }

    /// @inheritdoc IRegistryFactoryLike
    function isRegistry(address registry) external view returns (bool) {
        return _registries[registry];
    }
}
