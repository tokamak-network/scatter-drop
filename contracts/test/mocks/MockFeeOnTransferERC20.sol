// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "solmate/tokens/ERC20.sol";

/// @notice ERC20 that burns a fixed basis-point fee on every transfer, so the recipient
///         receives less than the requested amount. Used to test DropFactory's exact-receipt
///         guards against fee-on-transfer / non-standard tokens.
contract MockFeeOnTransferERC20 is ERC20 {
    uint256 public immutable feeBps; // e.g. 100 = 1%

    constructor(string memory name_, string memory symbol_, uint256 feeBps_) ERC20(name_, symbol_, 18) {
        feeBps = feeBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        uint256 fee = (amount * feeBps) / 10_000;
        balanceOf[msg.sender] -= amount;
        _burn2(fee);
        unchecked {
            balanceOf[to] += amount - fee;
        }
        emit Transfer(msg.sender, to, amount - fee);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;

        uint256 fee = (amount * feeBps) / 10_000;
        balanceOf[from] -= amount;
        _burn2(fee);
        unchecked {
            balanceOf[to] += amount - fee;
        }
        emit Transfer(from, to, amount - fee);
        return true;
    }

    /// @dev Reduce totalSupply for the burned fee without touching a holder balance
    ///      (the fee is destroyed in transit).
    function _burn2(uint256 amount) private {
        totalSupply -= amount;
    }
}
