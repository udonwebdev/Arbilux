// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IFlashLoanRecipient {
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}

interface IBalancerVault {
    function flashLoan(
        IFlashLoanRecipient recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface ICamelotRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 limitSqrtPrice;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

contract ArbiluxExecutor is IFlashLoanSimpleReceiver, IFlashLoanRecipient {
    using SafeERC20 for IERC20;

    address payable public immutable owner;
    IPoolAddressesProvider public immutable override ADDRESSES_PROVIDER;
    IPool public immutable override POOL;

    // Arbitrum One Verified Protocols
    address public constant BALANCER_VAULT   = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
    address public constant UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant SUSHISWAP_ROUTER  = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
    address public constant CAMELOT_ROUTER   = 0x1F721E2E82F6676FCE4eA07A5958cF098D339e18;

    error UnauthorizedCaller();
    error NegativePnL(uint256 expectedBalance, uint256 actualBalance);
    error InvalidVenue();

    event ArbitrageExecuted(address indexed asset, uint256 borrowed, uint256 profit, string lender);

    enum ProtocolVenue { UniswapV3, SushiSwap, Camelot }

    struct SwapHop {
        ProtocolVenue venue;
        address tokenIn;
        address tokenOut;
        uint24 uniFee;
        uint256 minAmountOut;
    }

    struct RoutePayload {
        address intermediateToken;
        uint24 uniPoolFee;
        uint256 minIntermediaryAmount;
        uint256 minFinalAmount;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert UnauthorizedCaller();
        _;
    }

    constructor(address _addressProvider) {
        owner = payable(msg.sender);
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
        POOL = IPool(IPoolAddressesProvider(_addressProvider).getPool());
    }

    // --- FLASH LOAN ENTRYPOINTS ---

    /// @notice Borrow from Balancer V2 (0% fee)
    function requestBalancerFlashLoan(
        address asset,
        uint256 amount,
        bytes calldata params
    ) external onlyOwner {
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(asset);

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        IBalancerVault(BALANCER_VAULT).flashLoan(
            IFlashLoanRecipient(address(this)),
            tokens,
            amounts,
            params
        );
    }

    /// @notice Borrow from Aave V3 (0.05% fee backup)
    function requestFlashLoan(
        address asset,
        uint256 amount,
        bytes calldata params
    ) external onlyOwner {
        POOL.flashLoanSimple(address(this), asset, amount, params, 0);
    }

    // --- CALLBACK 1: BALANCER V2 (0% FEE) ---

    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override {
        if (msg.sender != BALANCER_VAULT) revert UnauthorizedCaller();

        address asset = address(tokens[0]);
        uint256 amount = amounts[0];
        uint256 fee = feeAmounts[0];
        uint256 totalOwed = amount + fee;

        _executeSwaps(userData, amount, asset);

        uint256 currentBalance = IERC20(asset).balanceOf(address(this));
        if (currentBalance < totalOwed) {
            revert NegativePnL(totalOwed, currentBalance);
        }

        uint256 profit = currentBalance - totalOwed;

        emit ArbitrageExecuted(asset, amount, profit, "BALANCER_V2");

        // Repay Balancer Vault
        IERC20(asset).safeTransfer(BALANCER_VAULT, totalOwed);

        // Sweep Net Profit
        if (profit > 0) {
            IERC20(asset).safeTransfer(owner, profit);
        }
    }

    // --- CALLBACK 2: AAVE V3 (0.05% FEE) ---

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        if (msg.sender != address(POOL) || initiator != address(this)) {
            revert UnauthorizedCaller();
        }

        uint256 totalOwed = amount + premium;

        _executeSwaps(params, amount, asset);

        uint256 currentBalance = IERC20(asset).balanceOf(address(this));
        if (currentBalance < totalOwed) {
            revert NegativePnL(totalOwed, currentBalance);
        }

        uint256 profit = currentBalance - totalOwed;

        emit ArbitrageExecuted(asset, amount, profit, "AAVE_V3");

        // Repay Aave Pool
        IERC20(asset).forceApprove(address(POOL), totalOwed);

        // Sweep Net Profit
        if (profit > 0) {
            IERC20(asset).safeTransfer(owner, profit);
        }

        return true;
    }

    // --- INTERNAL ROUTER ---

    function _executeSwaps(bytes memory params, uint256 initialAmount, address asset) internal {
        if (params.length == 0) return;

        // Backward compatibility for 2-hop RoutePayload (128 bytes: 4 x 32 bytes)
        if (params.length == 128) {
            RoutePayload memory payload = abi.decode(params, (RoutePayload));

            // Hop 1: asset -> intermediateToken on UniV3
            IERC20(asset).forceApprove(UNISWAP_V3_ROUTER, initialAmount);
            ISwapRouter.ExactInputSingleParams memory uniParams = ISwapRouter.ExactInputSingleParams({
                tokenIn: asset,
                tokenOut: payload.intermediateToken,
                fee: payload.uniPoolFee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: initialAmount,
                amountOutMinimum: payload.minIntermediaryAmount,
                sqrtPriceLimitX96: 0
            });
            uint256 intermediateAmount = ISwapRouter(UNISWAP_V3_ROUTER).exactInputSingle(uniParams);

            // Hop 2: intermediateToken -> asset on SushiSwap
            IERC20(payload.intermediateToken).forceApprove(SUSHISWAP_ROUTER, intermediateAmount);
            address[] memory path = new address[](2);
            path[0] = payload.intermediateToken;
            path[1] = asset;

            uint256[] memory finalAmounts = IUniswapV2Router02(SUSHISWAP_ROUTER).swapExactTokensForTokens(
                intermediateAmount,
                payload.minFinalAmount,
                path,
                address(this),
                block.timestamp
            );
            require(finalAmounts.length > 0, "SwapFailed");
            return;
        }

        // Multi-hop dynamic SwapHop[] execution
        SwapHop[] memory hops = abi.decode(params, (SwapHop[]));
        uint256 currentHopAmount = initialAmount;

        for (uint256 i = 0; i < hops.length; i++) {
            SwapHop memory hop = hops[i];

            if (hop.venue == ProtocolVenue.UniswapV3) {
                IERC20(hop.tokenIn).forceApprove(UNISWAP_V3_ROUTER, currentHopAmount);
                ISwapRouter.ExactInputSingleParams memory uniParams = ISwapRouter.ExactInputSingleParams({
                    tokenIn: hop.tokenIn,
                    tokenOut: hop.tokenOut,
                    fee: hop.uniFee,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: currentHopAmount,
                    amountOutMinimum: hop.minAmountOut,
                    sqrtPriceLimitX96: 0
                });
                currentHopAmount = ISwapRouter(UNISWAP_V3_ROUTER).exactInputSingle(uniParams);

            } else if (hop.venue == ProtocolVenue.SushiSwap) {
                IERC20(hop.tokenIn).forceApprove(SUSHISWAP_ROUTER, currentHopAmount);
                address[] memory path = new address[](2);
                path[0] = hop.tokenIn;
                path[1] = hop.tokenOut;

                uint256[] memory amounts = IUniswapV2Router02(SUSHISWAP_ROUTER).swapExactTokensForTokens(
                    currentHopAmount,
                    hop.minAmountOut,
                    path,
                    address(this),
                    block.timestamp
                );
                currentHopAmount = amounts[amounts.length - 1];

            } else if (hop.venue == ProtocolVenue.Camelot) {
                IERC20(hop.tokenIn).forceApprove(CAMELOT_ROUTER, currentHopAmount);
                ICamelotRouter.ExactInputSingleParams memory camParams = ICamelotRouter.ExactInputSingleParams({
                    tokenIn: hop.tokenIn,
                    tokenOut: hop.tokenOut,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: currentHopAmount,
                    amountOutMinimum: hop.minAmountOut,
                    limitSqrtPrice: 0
                });
                currentHopAmount = ICamelotRouter(CAMELOT_ROUTER).exactInputSingle(camParams);

            } else {
                revert InvalidVenue();
            }
        }
    }

    function sweep(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(owner, balance);
    }

    receive() external payable {}
}
