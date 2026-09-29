// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ArbiluxExecutor} from "../src/ArbiluxExecutor.sol";

contract DeployArbilux is Script {
    // Arbitrum One Aave V3 PoolAddressesProvider
    address constant ARB_AAVE_PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        ArbiluxExecutor executor = new ArbiluxExecutor(ARB_AAVE_PROVIDER);

        console2.log("ArbiluxExecutor deployed successfully on Arbitrum One!");
        console2.log("Contract Address:", address(executor));
        console2.log("Owner Address:", executor.owner());
        console2.log("Pool Addresses Provider:", address(executor.ADDRESSES_PROVIDER()));

        vm.stopBroadcast();
    }
}
