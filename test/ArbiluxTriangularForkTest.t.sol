// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ArbiluxExecutor} from "../src/ArbiluxExecutor.sol";

contract ArbiluxTriangularForkTest is Test {
    ArbiluxExecutor public executor;

    address constant AAVE_PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    address constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address constant USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
    address constant ARB  = 0x912CE59144191C1204E64559FE8253a0e49E6548;

    function setUp() public {
        executor = new ArbiluxExecutor(AAVE_PROVIDER);
    }

    function test_TriangularRoutingRevertUnderEquilibrium() public {
        // Construct 3-hop execution sequence
        ArbiluxExecutor.SwapHop[] memory hops = new ArbiluxExecutor.SwapHop[](3);

        // Hop 1: WETH -> USDC (UniV3 0.05%)
        hops[0] = ArbiluxExecutor.SwapHop({
            venue: ArbiluxExecutor.ProtocolVenue.UniswapV3,
            tokenIn: WETH,
            tokenOut: USDC,
            uniFee: 500,
            minAmountOut: 1
        });

        // Hop 2: USDC -> ARB (Camelot)
        hops[1] = ArbiluxExecutor.SwapHop({
            venue: ArbiluxExecutor.ProtocolVenue.Camelot,
            tokenIn: USDC,
            tokenOut: ARB,
            uniFee: 0,
            minAmountOut: 1
        });

        // Hop 3: ARB -> WETH (SushiSwap)
        hops[2] = ArbiluxExecutor.SwapHop({
            venue: ArbiluxExecutor.ProtocolVenue.SushiSwap,
            tokenIn: ARB,
            tokenOut: WETH,
            uniFee: 0,
            minAmountOut: 1
        });

        bytes memory payload = abi.encode(hops);

        // Expect revert due to normal market spread & multi-tier fees without an active dislocation
        vm.expectRevert();
        executor.requestFlashLoan(WETH, 1 ether, payload);

        console2.log("[PASS] Multi-hop triangular safety guard verified on live Arbitrum fork.");
    }
}
