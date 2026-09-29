import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { calculateMultiLenderSizing } from './math.js';
import { ArbiluxRelayer } from './relayer.js';
import { TelemetryBroadcaster } from './wsServer.js';
import { BatchPoolScanner } from './batchScanner.js';
import { WATCH_POOLS } from '../config/pools.js';
dotenv.config();
class ArbiluxEngine {
    provider;
    relayer = null;
    broadcaster;
    scanner;
    isExecuting = false;
    minSpreadBps = 35;
    recentTx = [];
    constructor() {
        // Port 8545 serves the WebSocket telemetry stream to the web UI
        this.broadcaster = new TelemetryBroadcaster(8545);
        const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.scanner = new BatchPoolScanner(this.provider);
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
        try {
            const startTime = performance.now();
            const results = await this.scanner.scanAllPools();
            const latencyMs = (performance.now() - startTime).toFixed(1);
            if (results.length === 0)
                return;
            // Extract primary WETH/USDC benchmark pair for UI compatibility
            const uniWethUsdc = results.find((r) => r.pool.id === 'uni-weth-usdc-005') || results[0];
            const sushiWethUsdc = results.find((r) => r.pool.id === 'sushi-weth-usdc');
            const uniPrice = uniWethUsdc.price;
            const sushiPrice = sushiWethUsdc ? sushiWethUsdc.price : uniPrice;
            const spreadBps = Math.abs((uniPrice - sushiPrice) / sushiPrice) * 10000;
            // Sizing calculation if reserves available
            let optimalInputWeth = '0.0';
            let projectedProfitWeth = '0.0';
            if (sushiWethUsdc && sushiWethUsdc.reserve0 && sushiWethUsdc.reserve1) {
                const sizing = calculateMultiLenderSizing(sushiWethUsdc.reserve0, sushiWethUsdc.reserve1, sushiWethUsdc.reserve1, sushiWethUsdc.reserve0, uniWethUsdc.pool.feeTier ? uniWethUsdc.pool.feeTier / 100 : 5, 30);
                optimalInputWeth = ethers.formatEther(sizing.optimalInput);
                projectedProfitWeth = ethers.formatEther(sizing.projectedNetProfit);
            }
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
            // Log high-level summary & sample prices across universe
            const sample = results.slice(0, 4).map(r => `${r.pool.name}: $${r.price.toFixed(2)}`).join(' | ');
            console.log(`[BATCH MULTICALL3] ${results.length}/${WATCH_POOLS.length} pools scanned in ${latencyMs}ms | ${sample} | WETH/USDC Spread: ${spreadBps.toFixed(2)} bps`);
        }
        catch (err) {
            console.error('[INGESTION LAG / RPC THROTTLE]:', err.shortMessage || err.message || err);
        }
    }
    start() {
        console.log('[ARBILUX] Starting 50-Pool Multicall3 Matrix stream at 1,500ms intervals...');
        setInterval(() => this.runCycle(), 1500);
    }
}
const engine = new ArbiluxEngine();
engine.start();
