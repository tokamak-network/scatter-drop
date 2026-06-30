// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IIdentityRegistry } from "../../src/interfaces/IIdentityRegistry.sol";

/// @notice Test double for a zk-X509 IdentityRegistry with settable expiries.
contract MockIdentityRegistry is IIdentityRegistry {
    mapping(address => uint64) private _verifiedUntil;

    /// @notice Set the verification expiry for `account`.
    function setVerifiedUntil(address account, uint64 until) external {
        _verifiedUntil[account] = until;
    }

    /// @inheritdoc IIdentityRegistry
    function verifiedUntil(address account) external view returns (uint64) {
        return _verifiedUntil[account];
    }
}
