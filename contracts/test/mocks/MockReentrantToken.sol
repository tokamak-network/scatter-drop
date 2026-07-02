// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MockERC20 } from "./MockERC20.sol";
import { DropFactory } from "../../src/DropFactory.sol";

/// @notice A token that reenters `DropFactory.createDrop` from inside its
///         `transferFrom` (the point the factory pulls funds). Used to prove the
///         factory's `nonReentrant` guard aborts the whole transaction. The
///         reentrant call's args are irrelevant — `nonReentrant` reverts before the
///         body runs.
contract MockReentrantToken is MockERC20 {
    DropFactory public factory;
    bool public armed;

    constructor() MockERC20("Reenter", "RE", 18) { }

    function arm(DropFactory f) external {
        factory = f;
        armed = true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (armed) {
            armed = false; // one-shot, avoid infinite recursion if the guard were absent
            factory.createDrop(0, address(this), bytes32(uint256(1)), 1, 0, 0, address(0));
        }
        return super.transferFrom(from, to, amount);
    }
}
