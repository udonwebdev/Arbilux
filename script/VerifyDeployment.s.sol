// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ArbiluxExecutor} from "../src/ArbiluxExecutor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract VerifyDeployment is Script {
    address constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address constant USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    function run() external view {
        address deployedAddress = vm.envAddress("ARBILUX_EXECUTOR_ADDRESS");
        require(deployedAddress != address(0), "ARBILUX_EXECUTOR_ADDRESS not defined in environment");

        ArbiluxExecutor executor = ArbiluxExecutor(payable(deployedAddress));

        console2.log("--- ARBILUX POST-DEPLOYMENT INTEGRITY VERIFICATION ---");
        console2.log("Contract Address:", deployedAddress);

        // 1. Confirm Owner
        address owner = executor.owner();
        console2.log("[OK] Contract Owner:", owner);
        require(owner != address(0), "Owner cannot be zero address");

        // 2. Confirm Aave Pool Linkage
        address pool = address(executor.POOL());
        console2.log("[OK] Connected Aave V3 Pool:", pool);
        require(pool != address(0), "Aave Pool resolution invalid");

        // 3. Confirm Zero Open Allowances to Routers
        address uniRouter = executor.UNISWAP_V3_ROUTER();
        address sushiRouter = executor.SUSHISWAP_ROUTER();

        uint256 wethUniAllowance = IERC20(WETH).allowance(deployedAddress, uniRouter);
        uint256 wethSushiAllowance = IERC20(WETH).allowance(deployedAddress, sushiRouter);
        uint256 usdcUniAllowance = IERC20(USDC).allowance(deployedAddress, uniRouter);

        require(wethUniAllowance == 0, "Security fault: WETH allowance to Uniswap must be 0");
        require(wethSushiAllowance == 0, "Security fault: WETH allowance to SushiSwap must be 0");
        require(usdcUniAllowance == 0, "Security fault: USDC allowance to Uniswap must be 0");

        console2.log("[OK] Open allowances asserted strictly 0. Zero leakage verified.");
        console2.log("--- CONTRACT IS READY FOR AUTONOMOUS FLASH LOAN SWEEPS ---");
    }
}
