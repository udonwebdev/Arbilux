// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ArbiluxExecutor} from "../src/ArbiluxExecutor.sol";

contract DeployBase is Script {
    address constant BASE_AAVE_PROVIDER = 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        ArbiluxExecutor executor = new ArbiluxExecutor(BASE_AAVE_PROVIDER);

        console2.log("ArbiluxExecutor deployed on Base Mainnet!");
        console2.log("Contract Address:", address(executor));
        console2.log("Owner Address:", executor.owner());

        vm.stopBroadcast();
    }
}
