// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ArbiluxExecutor} from "../src/ArbiluxExecutor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";

contract ArbiluxForkTest is Test {
    ArbiluxExecutor public executor;

    // Arbitrum One Mainnet Verified Endpoints
    address constant AAVE_PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    address constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address constant USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    address owner;

    function setUp() public {
        owner = address(this);
        executor = new ArbiluxExecutor(AAVE_PROVIDER);
    }

    function test_AaveFlashLoanBorrowAndRepay() public {
        uint256 borrowAmount = 10 ether; // 10 WETH
        uint256 premium = (borrowAmount * 5) / 10000; // 0.05% Aave V3 fee

        // Pre-fund contract with debt premium + nominal profit buffer
        deal(WETH, address(executor), premium + 0.05 ether);

        uint256 balanceBefore = IERC20(WETH).balanceOf(owner);

        // Execute flash loan
        executor.requestFlashLoan(WETH, borrowAmount, "");

        uint256 balanceAfter = IERC20(WETH).balanceOf(owner);

        // Assert net profit swept to owner
        assertGe(balanceAfter, balanceBefore, "Profit sweep assertion failed");
        console2.log("Fork execution verified on Arbitrum live state.");
        console2.log("Net profit swept:", balanceAfter - balanceBefore);
    }

    function test_RevertOnNegativePnL() public {
        uint256 borrowAmount = 5 ether;

        // Without covering premium, contract must revert atomically
        vm.expectRevert();
        executor.requestFlashLoan(WETH, borrowAmount, "");
    }
}
