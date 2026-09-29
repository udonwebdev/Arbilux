import { ethers, Contract } from 'ethers';
import { WATCH_POOLS } from '../config/pools.js';
import { calculateOptimalInput } from './math.js';
// Minimal ABIs
const UNISWAP_V3_POOL_ABI = [
    'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];
const SUSHISWAP_PAIR_ABI = [
    'event Sync(uint112 reserve0, uint112 reserve1)',
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)',
];
export class ArbiluxScanner {
    provider;
    constructor(rpcUrl) {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
    }
    async scanPair(poolUni, poolSushi) {
        const uniContract = new Contract(poolUni.poolAddress, UNISWAP_V3_POOL_ABI, this.provider);
        const sushiContract = new Contract(poolSushi.poolAddress, SUSHISWAP_PAIR_ABI, this.provider);
        try {
            const [slot0, reserves, sushiToken0] = await Promise.all([
                uniContract.slot0(),
                sushiContract.getReserves(),
                sushiContract.token0(),
            ]);
            const sqrtPriceX96 = BigInt(slot0.sqrtPriceX96);
            // Raw Uni V3 ratio (token1 / token0) before decimal adjustment
            const rawUniPriceRatio = Number(sqrtPriceX96 * sqrtPriceX96) / Number(2n ** 192n);
            // Adjust for decimals difference (e.g. WETH 18 vs USDC 6 => 10^(18 - 6) = 10^12)
            const decimalAdjustment = 10 ** (poolUni.token0.decimals - poolUni.token1.decimals);
            const uniPrice = rawUniPriceRatio * decimalAdjustment;
            // Sushi reserves ordering
            const isSushiToken0Base = sushiToken0.toLowerCase() === poolSushi.token0.address.toLowerCase();
            const r0 = BigInt(reserves.reserve0);
            const r1 = BigInt(reserves.reserve1);
            const [rBase, rQuote] = isSushiToken0Base ? [r0, r1] : [r1, r0];
            // Sushi price formatted in USDC per WETH
            const sushiPrice = (Number(rQuote) / 10 ** poolSushi.token1.decimals) / (Number(rBase) / 10 ** poolSushi.token0.decimals);
            const spreadBps = Math.abs((uniPrice - sushiPrice) / sushiPrice) * 10000;
            console.log(`[TICK] ${poolUni.token0.symbol}/${poolUni.token1.symbol} | UniV3: $${uniPrice.toFixed(2)} | Sushi: $${sushiPrice.toFixed(2)} | Spread: ${spreadBps.toFixed(2)} bps`);
            // Trigger threshold check (> 30 bps required to cover swap fees + flash fee)
            if (spreadBps > 30) {
                console.log(`[ALERT] Dislocation detected! Spread: ${spreadBps.toFixed(2)} bps. Calculating optimal loan size...`);
                // Call sizing engine
                const optimalBorrow = calculateOptimalInput(rBase, rQuote, rQuote, rBase, poolUni.feeTier / 100, 30);
                console.log(`[CALCULUS] Optimal Loan Input: ${ethers.formatUnits(optimalBorrow, poolUni.token0.decimals)} ${poolUni.token0.symbol}`);
            }
        }
        catch (err) {
            console.error(`[ERROR] Ingestion error on ${poolUni.id}:`, err);
        }
    }
    async start() {
        console.log('[ARBILUX] Ingestion scanner online. Polling target venues on Arbitrum One...');
        // Initial scan
        await this.scanPair(WATCH_POOLS[0], WATCH_POOLS[1]);
        setInterval(async () => {
            await this.scanPair(WATCH_POOLS[0], WATCH_POOLS[1]);
        }, 2000);
    }
}
// Direct Execution Entrypoint
const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
const scanner = new ArbiluxScanner(RPC_URL);
scanner.start();
