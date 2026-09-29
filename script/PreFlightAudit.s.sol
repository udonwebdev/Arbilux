// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PreFlightAudit is Script {
    address constant ARB_AAVE_PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    address constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;

    function run() external view {
        console2.log("--- STARTING ARBILUX PRE-FLIGHT AUDIT ---");

        // 1. Verify Aave V3 Provider connectivity
        IPoolAddressesProvider provider = IPoolAddressesProvider(ARB_AAVE_PROVIDER);
        address pool = provider.getPool();
        console2.log("[OK] Arbitrum Aave V3 Pool Resolved:", pool);
        require(pool != address(0), "Aave V3 Pool address resolution failed");

        // 2. Resolve aToken address where Aave V3 stores underlying liquidity
        DataTypes.ReserveData memory reserve = IPool(pool).getReserveData(WETH);
        address aTokenAddress = reserve.aTokenAddress;
        console2.log("[OK] Resolved Aave V3 aToken (aArbWETH):", aTokenAddress);

        // 3. Verify WETH Liquidity held in the aToken vault
        uint256 poolWethBalance = IERC20(WETH).balanceOf(aTokenAddress);
        console2.log("[OK] Aave V3 WETH Liquidity Pool Depth:", poolWethBalance / 1e18, "WETH");
        require(poolWethBalance > 100 ether, "Insufficient pool flash liquidity");

        console2.log("--- PRE-FLIGHT AUDIT PASSED: READY FOR BROADCAST ---");
    }
}
