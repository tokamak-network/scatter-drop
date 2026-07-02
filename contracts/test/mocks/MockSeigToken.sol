// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MockERC20 } from "./MockERC20.sol";

/// @dev Callback a spender implements to receive `approveAndCall` (Tokamak TON / SeigToken).
interface IOnApprove {
    function onApprove(address owner, address spender, uint256 amount, bytes calldata data)
        external
        returns (bool);
}

/// @notice Test double for Tokamak TON (SeigToken): a standard ERC20 EXCEPT
///         `transferFrom` only succeeds when the caller is the `from` or the `to`
///         ("only sender or recipient can transfer"), plus `approveAndCall` which
///         approves and invokes the spender's `onApprove` in one call.
contract MockSeigToken is MockERC20 {
    error OnlySenderOrRecipient();
    error OnApproveFailed();

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        MockERC20(name_, symbol_, decimals_)
    { }

    /// @dev SeigToken restriction: a third party can't move tokens via transferFrom.
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (msg.sender != from && msg.sender != to) revert OnlySenderOrRecipient();
        return super.transferFrom(from, to, amount);
    }

    /// @dev Approve `spender` for `amount`, then call its `onApprove` in the same tx.
    function approveAndCall(address spender, uint256 amount, bytes calldata data) external returns (bool) {
        approve(spender, amount);
        if (!IOnApprove(spender).onApprove(msg.sender, spender, amount, data)) revert OnApproveFailed();
        return true;
    }
}
