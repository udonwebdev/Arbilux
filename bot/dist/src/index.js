import { ethers, Contract, AbiCoder } from 'ethers';
import dotenv from 'dotenv';
import { WATCH_POOLS } from '../config/pools.js';
import { calculateMultiLenderSizing } from './math.js';
import { ArbiluxRelayer } from './relayer.js';
import { TelemetryBroadcaster } from './wsServer.js';
dotenv.config();
const UNISWAP_V3_POOL_ABI = [
    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];
const SUSHISWAP_PAIR_ABI = [
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)',
];
class ArbiluxEngine {
    provider;
    relayer = null;
    broadcaster;
    isExecuting = false;
    minSpreadBps = 35;
    recentTx = [];
    constructor() {
        // Port 8545 serves the WebSocket telemetry stream to the web UI
        this.broadcaster = new TelemetryBroadcaster(8545);
        const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        const privateKey = process.env.PRIVATE_KEY;
        const contractAddress = process.env.ARBILUX_EXECUTOR_ADDRESS;
        const privateRpc = process.env.BUILDER_PRIVATE_RPC || 'https://rpc.titanbuilder.xyz';
        if (privateKey && contractAddress && contractAddress.startsWith('0x')) {
            this.relayer = new ArbiluxRelayer(privateKey, contractAddress, rpcUrl, privateRpc);
            console.log(`[ENGINE] Relayer linked to contract: ${contractAddress}`);
        }
        else {
            console.warn('[ENGINE] Running in TELEMETRY / MONITOR ONLY mode (Contract address or Key pending).');
        }
    }
    async runCycle() {
        const poolUni = WATCH_POOLS[0]; // WETH / USDC UniV3
        const poolSushi = WATCH_POOLS[1]; // WETH / USDC SushiV2
        try {
            const uniContract = new Contract(poolUni.poolAddress, UNISWAP_V3_POOL_ABI, this.provider);
            const sushiContract = new Contract(poolSushi.poolAddress, SUSHISWAP_PAIR_ABI, this.provider);
            // Concurrent fetch
            const [slot0, reserves, sushiToken0] = await Promise.all([
                uniContract.slot0(),
                sushiContract.getReserves(),
                sushiContract.token0(),
            ]);
            // Uniswap V3 Price Derivation (USDC per WETH)
            // UniV3: WETH (token0, 18 dec), USDC (token1, 6 dec) -> scale by 10^(18-6) = 10^12
            const sqrtPriceX96 = BigInt(slot0.sqrtPriceX96);
            const rawUniPriceRatio = Number(sqrtPriceX96 * sqrtPriceX96) / Number(2n ** 192n);
            const uniPrice = rawUniPriceRatio * 1e12;
            // SushiSwap V2 Price Derivation
            const isSushiToken0Base = sushiToken0.toLowerCase() === poolSushi.token0.address.toLowerCase();
            const r0 = BigInt(reserves.reserve0);
            const r1 = BigInt(reserves.reserve1);
            const [rBase, rQuote] = isSushiToken0Base ? [r0, r1] : [r1, r0];
            const sushiPrice = (Number(rQuote) / 1e6) / (Number(rBase) / 1e18);
            // Compute spread
            const spreadBps = Math.abs((uniPrice - sushiPrice) / sushiPrice) * 10000;
            // Run optimal sizing
            const sizing = calculateMultiLenderSizing(rBase, rQuote, rQuote, rBase, poolUni.feeTier ? poolUni.feeTier / 100 : 5, 30);
            const optimalInputWeth = ethers.formatEther(sizing.optimalInput);
            const projectedProfitWeth = ethers.formatEther(sizing.projectedNetProfit);
            // Broadcast live metrics to the Next.js frontend
            this.broadcaster.broadcast({
                timestamp: Date.now(),
                pair: 'WETH/USDC',
                uniPrice,
                sushiPrice,
                spreadBps,
                optimalInputWeth,
                projectedProfitWeth,
                isExecuting: this.isExecuting,
                circuitBreakerTripped: false,
                recentTx: this.recentTx,
            });
            console.log(`[TICK] UniV3: $${uniPrice.toFixed(2)} | Sushi: $${sushiPrice.toFixed(2)} | Spread: ${spreadBps.toFixed(2)} bps | Opt: ${optimalInputWeth} WETH`);
            // Trigger execution if spread exceeds hurdle and relayer is armed
            if (spreadBps > this.minSpreadBps && sizing.projectedNetProfit > 0n && this.relayer && !this.isExecuting) {
                this.isExecuting = true;
                console.log(`[DISPATCH] In-money spread detected (${spreadBps.toFixed(2)} bps). Dispatching flash loan...`);
                const coder = AbiCoder.defaultAbiCoder();
                const routePayload = coder.encode(['tuple(address intermediateToken, uint24 uniPoolFee, uint256 minIntermediaryAmount, uint256 minFinalAmount)'], [[poolUni.token1.address, poolUni.feeTier || 500, 1n, 1n]]);
                const intent = {
                    asset: poolUni.token0.address,
                    amount: sizing.optimalInput,
                    params: routePayload,
                    lender: sizing.recommendedLender,
                };
                const txHash = await this.relayer.dispatchPrivateExecution(intent);
                if (txHash) {
                    this.recentTx.unshift({
                        hash: txHash,
                        profit: projectedProfitWeth,
                        lender: sizing.recommendedLender,
                        status: 'SUCCESS',
                        time: new Date().toLocaleTimeString(),
                    });
                    if (this.recentTx.length > 10)
                        this.recentTx.pop();
                }
                this.isExecuting = false;
            }
        }
        catch (err) {
            console.error('[INGESTION LAG / RPC THROTTLE]:', err.shortMessage || err.message || err);
        }
    }
    start() {
        console.log('[ARBILUX] Starting live pipeline at 1,500ms sequencer intervals...');
        setInterval(() => this.runCycle(), 1500);
    }
}
const engine = new ArbiluxEngine();
engine.start();
