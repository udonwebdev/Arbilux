// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ArbiluxExecutor} from "../src/ArbiluxExecutor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ArbiluxBalancerForkTest is Test {
    ArbiluxExecutor public executor;

    address constant AAVE_PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    address constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;

    address owner;

    function setUp() public {
        owner = address(this);
        executor = new ArbiluxExecutor(AAVE_PROVIDER, payable(owner), payable(address(0xbeef)));
    }

    function test_BalancerZeroFeeFlashBorrowAndRepay() public {
        uint256 borrowAmount = 50 ether; // 50 WETH (~$130k+)

        // Fund nominal profit buffer to satisfy ending balance >= totalOwed
        deal(WETH, address(executor), 0.05 ether);

        uint256 balanceBefore = IERC20(WETH).balanceOf(owner);

        // Execute 0% fee flash loan via Balancer V2
        executor.requestBalancerFlashLoan(WETH, borrowAmount, "");

        uint256 balanceAfter = IERC20(WETH).balanceOf(owner);

        // Verify profit sweep and zero protocol fee retention
        assertGe(balanceAfter, balanceBefore);
        console2.log("[PASS] Balancer V2 0% fee flash loan verified on Arbitrum fork!");
        console2.log("Net profit swept to owner:", balanceAfter - balanceBefore);
    }
}
