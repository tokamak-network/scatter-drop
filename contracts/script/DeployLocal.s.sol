// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { DropFactory } from "../src/DropFactory.sol";
import { IRegistryFactoryLike } from "../src/interfaces/IRegistryFactoryLike.sol";

import { MockERC20 } from "../test/mocks/MockERC20.sol";
import { MockIdentityRegistry } from "../test/mocks/MockIdentityRegistry.sol";
import { MockRegistryFactory } from "../test/mocks/MockRegistryFactory.sol";

/// @title DeployLocal
/// @notice Local-only (M3) deploy/seed scaffolding: stands up the full
///         scatter-drop stack on an anvil node with mocked zk-X509 and prints
///         the addresses for an off-chain SDK/frontend harness to drive over
///         RPC. Deploys a fee token + airdrop token, the operator/customer
///         identity registries, a registry factory, and a `DropFactory`, then
///         verifies the deployer (operator) and a demo customer and funds the
///         operator. The create→claim→sweep behaviour itself is asserted in
///         `test/E2E.t.sol` (in-VM); this script only provisions the environment.
///
/// @dev MOCK-ONLY — imports test doubles from `test/`. Do NOT use as a template
///      for a real (non-anvil) deployment; production deploys must wire the
///      genuine zk-X509 RegistryFactory / IdentityRegistry, not these mocks.
///
/// @dev Usage (anvil):
///   anvil &
///   forge script contracts/script/DeployLocal.s.sol \
///     --rpc-url http://127.0.0.1:8545 --broadcast \
///     --private-key $PRIVATE_KEY
///
/// Env (all optional, sensible local defaults):
///   FEE_AMOUNT    creation fee for CSV drops, in feeToken wei  (default 10e18)
///   FUND_AMOUNT   feeToken+airdropToken minted to the operator (default 1_000_000e18)
///   TREASURY      fixed fee-withdrawal destination             (default deployer)
///   DEMO_CUSTOMER customer address verified for claims         (default anvil acct #1)
contract DeployLocal is Script {
    // AirdropType.CSV — v1 ships CSV (Merkle) only.
    uint8 internal constant CSV = 0;

    // Default anvil account #1 (used as the demo customer when DEMO_CUSTOMER is unset).
    address internal constant ANVIL_ACCT_1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function run() external {
        address deployer = msg.sender;
        uint256 feeAmount = vm.envOr("FEE_AMOUNT", uint256(10 ether));
        uint256 fundAmount = vm.envOr("FUND_AMOUNT", uint256(1_000_000 ether));
        address treasury = vm.envOr("TREASURY", deployer);
        address demoCustomer = vm.envOr("DEMO_CUSTOMER", ANVIL_ACCT_1);

        vm.startBroadcast();

        // Tokens: a fee token and the airdrop token (separate, as in production).
        MockERC20 feeToken = new MockERC20("Fee Token", "FEE", 18);
        MockERC20 airdropToken = new MockERC20("Airdrop Token", "DROP", 18);

        // zk-X509 mocks: operator gate (global) + customer gate (per-campaign).
        MockIdentityRegistry operatorRegistry = new MockIdentityRegistry();
        MockIdentityRegistry customerRegistry = new MockIdentityRegistry();

        // Registry factory recognising the customer registry as a standard one.
        MockRegistryFactory zkFactory = new MockRegistryFactory();
        zkFactory.setRegistry(address(customerRegistry), true);

        // The factory itself, then its CSV fee tier.
        DropFactory factory = new DropFactory(
            deployer,
            IERC20(address(feeToken)),
            address(operatorRegistry),
            IRegistryFactoryLike(address(zkFactory)),
            treasury
        );
        factory.setFee(CSV, feeAmount);

        // Verify the operator (deployer) and the demo customer well past any deadline.
        operatorRegistry.setVerifiedUntil(deployer, type(uint64).max);
        customerRegistry.setVerifiedUntil(demoCustomer, type(uint64).max);

        // Fund the operator with fees + tokens to distribute.
        feeToken.mint(deployer, fundAmount);
        airdropToken.mint(deployer, fundAmount);

        vm.stopBroadcast();

        console2.log("DropFactory       ", address(factory));
        console2.log("feeToken          ", address(feeToken));
        console2.log("airdropToken      ", address(airdropToken));
        console2.log("operatorRegistry  ", address(operatorRegistry));
        console2.log("customerRegistry  ", address(customerRegistry));
        console2.log("zkFactory         ", address(zkFactory));
        console2.log("treasury          ", treasury);
        console2.log("operator (deployer)", deployer);
        console2.log("demoCustomer      ", demoCustomer);
        console2.log("csvFee            ", feeAmount);
    }
}
