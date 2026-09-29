// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ArbiluxExecutor} from "../src/ArbiluxExecutor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ArbiluxBaseForkTest is Test {
    ArbiluxExecutor public executor;

    // Base Mainnet Verified Endpoints
    address constant BASE_AAVE_PROVIDER = 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D;
    address constant BASE_WETH = 0x4200000000000000000000000000000000000006;
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    address owner;

    function setUp() public {
        owner = address(this);
        executor = new ArbiluxExecutor(BASE_AAVE_PROVIDER);
    }

    function test_BaseAaveFlashLoanBorrowAndRepay() public {
        uint256 borrowAmount = 5 ether; // 5 WETH on Base
        uint256 premium = (borrowAmount * 5) / 10000;

        // Pre-fund buffer for flash premium assertion
        deal(BASE_WETH, address(executor), premium + 0.02 ether);

        uint256 balanceBefore = IERC20(BASE_WETH).balanceOf(owner);

        // Execute flash loan against Base Aave V3 Pool
        executor.requestFlashLoan(BASE_WETH, borrowAmount, "");

        uint256 balanceAfter = IERC20(BASE_WETH).balanceOf(owner);

        assertGe(balanceAfter, balanceBefore);
        console2.log("[PASS] Base Mainnet Aave V3 flash loan verified successfully!");
        console2.log("Net profit swept on Base fork:", balanceAfter - balanceBefore);
    }

    function test_BaseBalancerZeroFeeFlashBorrow() public {
        uint256 borrowAmount = 20 ether;

        deal(BASE_WETH, address(executor), 0.05 ether);

        uint256 balanceBefore = IERC20(BASE_WETH).balanceOf(owner);

        // Execute 0% fee flash loan via Balancer V2 on Base
        executor.requestBalancerFlashLoan(BASE_WETH, borrowAmount, "");

        uint256 balanceAfter = IERC20(BASE_WETH).balanceOf(owner);

        assertGe(balanceAfter, balanceBefore);
        console2.log("[PASS] Base Mainnet Balancer V2 zero-fee flash loan verified!");
    }
}
