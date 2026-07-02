// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MockERC20 } from "./MockERC20.sol";

/// @dev Callback a spender implements to receive `approveAndCall` (Tokamak TON / SeigToken).
interface IOnApprove {
    function onApprove(address owner, address spender, uint256 amount, bytes calldata data)
        external
        returns (bool);
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @notice Test double for Tokamak TON (SeigToken): a standard ERC20 EXCEPT
///         `transferFrom` only succeeds when the caller is the `from` or the `to`
///         ("only sender or recipient can transfer"), plus `approveAndCall` which
///         — like the real TON — first ERC165-checks the spender for the onApprove
///         interface, then invokes `onApprove` in the same call.
contract MockSeigToken is MockERC20 {
    /// @dev `bytes4(keccak256("onApprove(address,address,uint256,bytes)"))`.
    bytes4 private constant ON_APPROVE_ID = 0x4273ca16;

    error OnlySenderOrRecipient();
    error OnApproveFailed();
    error SpenderMissingOnApprove();

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        MockERC20(name_, symbol_, decimals_)
    { }

    /// @dev SeigToken restriction: a third party can't move tokens via transferFrom.
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (msg.sender != from && msg.sender != to) revert OnlySenderOrRecipient();
        return super.transferFrom(from, to, amount);
    }

    /// @dev Approve `spender`, ERC165-gate it (as the real TON does), then call onApprove.
    function approveAndCall(address spender, uint256 amount, bytes calldata data) external returns (bool) {
        approve(spender, amount);
        if (!_supportsOnApprove(spender)) revert SpenderMissingOnApprove();
        if (!IOnApprove(spender).onApprove(msg.sender, spender, amount, data)) revert OnApproveFailed();
        return true;
    }

    /// @dev Mirror OZ ERC165Checker: spender must support ERC165 (0x01ffc9a7) and the
    ///      onApprove interface, and must NOT claim the invalid 0xffffffff.
    function _supportsOnApprove(address spender) private view returns (bool) {
        return _query(spender, 0x01ffc9a7) && !_query(spender, 0xffffffff) && _query(spender, ON_APPROVE_ID);
    }

    function _query(address a, bytes4 id) private view returns (bool ok) {
        try IERC165(a).supportsInterface(id) returns (bool r) {
            ok = r;
        } catch {
            ok = false;
        }
    }
}
