// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IWETH {
    function withdraw(uint256 wad) external;
    function balanceOf(address account) external view returns (uint256);
}

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

abstract contract AutonomousProfitFunnel {
    // 60% Destination: Binance Arbitrum Deposit or Cold Safe
    address payable public immutable btcVaultDestination;
    // 40% Destination: Bot Relayer EOA for self-fueling gas
    address payable public immutable operatorFuelWallet;

    address public constant WETH_ADDRESS = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;

    uint256 public constant VAULT_BPS = 6000;      // 60%
    uint256 public constant FUEL_BPS = 4000;       // 40%
    uint256 public constant BPS_DENOM = 10000;

    // Granular receipt event emitted for every single executed block
    event FunnelSettlementReceipt(
        bytes32 indexed executionId,
        uint256 indexed timestamp,
        string assetSymbol,
        uint256 totalGrossProfit,
        uint256 btcVaultAllocation,
        uint256 operatorFuelAllocation,
        address btcVaultTarget,
        address fuelTarget
    );

    constructor(address payable _btcVault, address payable _fuelWallet) {
        require(_btcVault != address(0) && _fuelWallet != address(0), "INVALID_RECIPIENT");
        btcVaultDestination = _btcVault;
        operatorFuelWallet = _fuelWallet;
    }

    /// @notice Unwraps WETH and executes an atomic 60/40 sweep with instant receipt generation
    function _settleAndEmitReceiptWETH(bytes32 executionId, uint256 profit) internal {
        if (profit == 0) return;

        IWETH(WETH_ADDRESS).withdraw(profit);

        uint256 toVault = (profit * VAULT_BPS) / BPS_DENOM;
        uint256 toFuel = profit - toVault;

        if (toVault > 0) {
            (bool s1, ) = btcVaultDestination.call{value: toVault}("");
            require(s1, "VAULT_ETH_TRANSFER_FAILED");
        }
        if (toFuel > 0) {
            (bool s2, ) = operatorFuelWallet.call{value: toFuel}("");
            require(s2, "FUEL_ETH_TRANSFER_FAILED");
        }

        emit FunnelSettlementReceipt(
            executionId,
            block.timestamp,
            "ETH",
            profit,
            toVault,
            toFuel,
            btcVaultDestination,
            operatorFuelWallet
        );
    }

    /// @notice Sweeps standard tokens (e.g., WBTC, USDC) and emits settlement receipts
    function _settleAndEmitReceiptToken(bytes32 executionId, address token, string memory symbol, uint256 profit) internal {
        if (token == WETH_ADDRESS) {
            _settleAndEmitReceiptWETH(executionId, profit);
            return;
        }

        if (profit == 0) return;

        uint256 toVault = (profit * VAULT_BPS) / BPS_DENOM;
        uint256 toFuel = profit - toVault;

        if (toVault > 0) {
            require(IERC20(token).transfer(btcVaultDestination, toVault), "VAULT_TOKEN_FAILED");
        }
        if (toFuel > 0) {
            require(IERC20(token).transfer(operatorFuelWallet, toFuel), "FUEL_TOKEN_FAILED");
        }

        emit FunnelSettlementReceipt(
            executionId,
            block.timestamp,
            symbol,
            profit,
            toVault,
            toFuel,
            btcVaultDestination,
            operatorFuelWallet
        );
    }

    receive() external payable virtual {}
}

contract ArbiluxExecutor is AutonomousProfitFunnel, IFlashLoanSimpleReceiver, IFlashLoanRecipient {
    using SafeERC20 for IERC20;

    address payable public immutable owner;
    IPoolAddressesProvider public immutable override ADDRESSES_PROVIDER;
    IPool public immutable override POOL;

    // Arbitrum One Verified Protocols
    address public constant BALANCER_VAULT    = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
    address public constant UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant SUSHISWAP_ROUTER  = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
    address public constant CAMELOT_ROUTER    = 0x1F721E2E82F6676FCE4eA07A5958cF098D339e18;

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

    constructor(
        address _addressProvider,
        address payable _btcVault,
        address payable _fuelWallet
    ) AutonomousProfitFunnel(_btcVault, _fuelWallet) {
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

        // Sweep Net Profit via 60/40 Autonomous Profit Funnel
        if (profit > 0) {
            _settleAndEmitReceiptToken(bytes32(block.timestamp), asset, "TOKEN", profit);
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

        // Sweep Net Profit via 60/40 Autonomous Profit Funnel
        if (profit > 0) {
            _settleAndEmitReceiptToken(bytes32(block.timestamp), asset, "TOKEN", profit);
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
        uint256 bal = IERC20(token).balanceOf(address(this));
        _settleAndEmitReceiptToken(bytes32(block.timestamp), token, "SWEEP", bal);
    }

    receive() external payable override(AutonomousProfitFunnel) {}
}
