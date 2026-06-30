// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { DropFactory } from "../src/DropFactory.sol";
import { IRegistryFactoryLike } from "../src/interfaces/IRegistryFactoryLike.sol";

import { MockERC20 } from "../test/mocks/MockERC20.sol";

/// @title DeployFork
/// @notice Deploys `DropFactory` onto a running anvil **Sepolia fork**, wired to
///         the real zk-X509 `RegistryFactory` + users `IdentityRegistry`, and
///         writes the addresses to `deployments/<chainId>.json` for the
///         frontend / SDK to consume. The fee/airdrop tokens are fresh
///         `MockERC20`s (mintable) so the demo environment is self-contained.
///
/// @dev Run via `scripts/dev-fork.sh` (starts anvil + broadcasts), or directly
///      against an already-running fork:
///        forge script script/DeployFork.s.sol:DeployFork \
///          --rpc-url http://127.0.0.1:8545 --broadcast --private-key $KEY
///
/// Env (optional; real Sepolia defaults):
///   SEPOLIA_ZK_REGISTRY_FACTORY  RegistryFactory (default 0x9e93..85d9)
///   SEPOLIA_IDENTITY_REGISTRY    operator+customer IdentityRegistry (0x3cF6..ada3)
///   FEE_AMOUNT / FUND_AMOUNT / TREASURY
contract DeployFork is Script {
    address internal constant ZK_FACTORY = 0x9e937dF6ac0E85979622519068412A518fa085d9;
    address internal constant USERS_REGISTRY = 0x3cF6A96f1970053ffDf957074F988aD53D13ada3;
    uint8 internal constant CSV = 0;

    function run() external {
        uint256 feeAmount = vm.envOr("FEE_AMOUNT", uint256(10 ether));
        uint256 fundAmount = vm.envOr("FUND_AMOUNT", uint256(1_000_000 ether));
        address zkFactory = vm.envOr("SEPOLIA_ZK_REGISTRY_FACTORY", ZK_FACTORY);
        address operatorRegistry = vm.envOr("SEPOLIA_IDENTITY_REGISTRY", USERS_REGISTRY);

        vm.startBroadcast();

        // Capture the deployer inside the broadcast (see DeployLocal for the why).
        address deployer = msg.sender;
        address treasury = vm.envOr("TREASURY", deployer);

        MockERC20 feeToken = new MockERC20("Fee Token", "FEE", 18);
        MockERC20 airdropToken = new MockERC20("Airdrop Token", "DROP", 18);

        DropFactory factory = new DropFactory(
            deployer, IERC20(address(feeToken)), operatorRegistry, IRegistryFactoryLike(zkFactory), treasury
        );
        factory.setFee(CSV, feeAmount);

        feeToken.mint(deployer, fundAmount);
        airdropToken.mint(deployer, fundAmount);

        vm.stopBroadcast();

        _writeDeployments(factory, feeToken, airdropToken, operatorRegistry, zkFactory, treasury, deployer);
    }

    function _writeDeployments(
        DropFactory factory,
        MockERC20 feeToken,
        MockERC20 airdropToken,
        address operatorRegistry,
        address zkFactory,
        address treasury,
        address deployer
    ) internal {
        string memory o = "deployments";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "dropFactory", address(factory));
        vm.serializeAddress(o, "feeToken", address(feeToken));
        vm.serializeAddress(o, "airdropToken", address(airdropToken));
        vm.serializeAddress(o, "operatorRegistry", operatorRegistry);
        vm.serializeAddress(o, "zkFactory", zkFactory);
        vm.serializeAddress(o, "treasury", treasury);
        string memory json = vm.serializeAddress(o, "deployer", deployer);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console2.log("Wrote", path);
        console2.log("DropFactory ", address(factory));
        console2.log("feeToken    ", address(feeToken));
        console2.log("airdropToken", address(airdropToken));
    }
}
