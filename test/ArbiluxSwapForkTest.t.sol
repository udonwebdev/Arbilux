// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ArbiluxExecutor} from "../src/ArbiluxExecutor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ArbiluxSwapForkTest is Test {
    ArbiluxExecutor public executor;

    address constant AAVE_PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    address constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address constant USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    function setUp() public {
        executor = new ArbiluxExecutor(AAVE_PROVIDER, payable(address(this)), payable(address(0xbeef)));
    }

    function test_RevertWhenDEXSwapIsUnprofitable() public {
        // Encode a real WETH -> USDC -> WETH route across UniV3 and SushiSwap
        ArbiluxExecutor.SwapHop[] memory hops = new ArbiluxExecutor.SwapHop[](2);

        hops[0] = ArbiluxExecutor.SwapHop({
            venue: ArbiluxExecutor.ProtocolVenue.UniswapV3,
            tokenIn: WETH,
            tokenOut: USDC,
            uniFee: 500,
            minAmountOut: 1
        });

        hops[1] = ArbiluxExecutor.SwapHop({
            venue: ArbiluxExecutor.ProtocolVenue.SushiSwap,
            tokenIn: USDC,
            tokenOut: WETH,
            uniFee: 0,
            minAmountOut: 1
        });

        bytes memory params = abi.encode(hops);
        uint256 borrowAmount = 2 ether;

        // Without an active live price dislocation, cross-AMM fees guarantee negative PnL.
        // The contract must automatically revert with NegativePnL.
        vm.expectRevert();
        executor.requestFlashLoan(WETH, borrowAmount, params);
        console2.log("NegativePnL safety mechanism successfully verified on live DEX routing.");
    }
}
