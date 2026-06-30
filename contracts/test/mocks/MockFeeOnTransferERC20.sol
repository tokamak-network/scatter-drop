// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "solmate/tokens/ERC20.sol";

/// @notice ERC20 that burns a fixed basis-point fee on every transfer, so the recipient
///         receives less than the requested amount. Used to test DropFactory's exact-receipt
///         guards against fee-on-transfer / non-standard tokens.
contract MockFeeOnTransferERC20 is ERC20 {
    uint256 public immutable feeBps; // e.g. 100 = 1%

    error FeeTooHigh();

    constructor(string memory name_, string memory symbol_, uint256 feeBps_) ERC20(name_, symbol_, 18) {
        if (feeBps_ > 10_000) revert FeeTooHigh();
        feeBps = feeBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _transferWithFee(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transferWithFee(from, to, amount);
        return true;
    }

    /// @dev Move `amount` from `from`, deliver `amount - fee` to `to`, and burn `fee` in transit.
    ///      Emits both the delivery and the burn `Transfer` so events match the state changes.
    function _transferWithFee(address from, address to, uint256 amount) private {
        uint256 fee = (amount * feeBps) / 10_000;
        balanceOf[from] -= amount;
        unchecked {
            balanceOf[to] += amount - fee;
            totalSupply -= fee;
        }
        emit Transfer(from, to, amount - fee);
        if (fee > 0) emit Transfer(from, address(0), fee);
    }
}
