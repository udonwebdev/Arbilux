import { ethers, Contract } from 'ethers';
import dotenv from 'dotenv';
import { WATCH_POOLS } from '../config/pools.js';
import { calculateMultiLenderSizing } from './math.js';
dotenv.config();
const UNISWAP_V3_POOL_ABI = [
    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];
const SUSHISWAP_PAIR_ABI = [
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)',
];
export class HistoricalBacktester {
    provider;
    constructor(rpcUrl) {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
    }
    async runBacktest(startBlock, endBlock) {
        console.log(`[BACKTEST] Starting replay from block ${startBlock} to ${endBlock}...`);
        const poolUni = WATCH_POOLS[0];
        const poolSushi = WATCH_POOLS[1];
        const uniContract = new Contract(poolUni.poolAddress, UNISWAP_V3_POOL_ABI, this.provider);
        const sushiContract = new Contract(poolSushi.poolAddress, SUSHISWAP_PAIR_ABI, this.provider);
        let opportunitiesFound = 0;
        let totalSimulatedProfitWei = 0n;
        let cumulativeSpread = 0;
        let blocksSampled = 0;
        // Step across blocks (sample every 5 blocks to avoid RPC throttling)
        for (let currentBlock = startBlock; currentBlock <= endBlock; currentBlock += 5) {
            try {
                const [slot0, reserves, sushiToken0] = await Promise.all([
                    uniContract.slot0({ blockTag: currentBlock }),
                    sushiContract.getReserves({ blockTag: currentBlock }),
                    sushiContract.token0({ blockTag: currentBlock }),
                ]);
                const sqrtPriceX96 = BigInt(slot0.sqrtPriceX96);
                const uniPrice = Number(sqrtPriceX96 * sqrtPriceX96) / Number(2n ** 192n);
                const isSushiToken0Base = sushiToken0.toLowerCase() === poolSushi.token0.address.toLowerCase();
                const r0 = BigInt(reserves.reserve0);
                const r1 = BigInt(reserves.reserve1);
                const [rBase, rQuote] = isSushiToken0Base ? [r0, r1] : [r1, r0];
                const sushiPrice = Number(rQuote) / Number(rBase);
                const spreadBps = Math.abs((uniPrice - sushiPrice) / sushiPrice) * 10000;
                cumulativeSpread += spreadBps;
                blocksSampled++;
                if (spreadBps > 30) {
                    const sizing = calculateMultiLenderSizing(rBase, rQuote, rQuote, rBase, poolUni.feeTier / 100, 30);
                    if (sizing.projectedNetProfit > 0n) {
                        opportunitiesFound++;
                        totalSimulatedProfitWei += sizing.projectedNetProfit;
                        console.log(`[DISLOCATION @ Block ${currentBlock}] Spread: ${spreadBps.toFixed(2)} bps | Net Edge: ${ethers.formatEther(sizing.projectedNetProfit)} WETH via ${sizing.recommendedLender}`);
                    }
                }
            }
            catch (err) {
                // Skip un-indexed historical states on pruned public RPCs
                continue;
            }
        }
        const result = {
            totalBlocksScanned: blocksSampled,
            opportunitiesFound,
            totalSimulatedProfitWei,
            avgSpreadBps: blocksSampled > 0 ? cumulativeSpread / blocksSampled : 0,
        };
        this.printSummary(result);
        return result;
    }
    printSummary(res) {
        console.log('\n========================================');
        console.log('       ARBILUX BACKTEST AUDIT REPORT     ');
        console.log('========================================');
        console.log(`Blocks Sampled:         ${res.totalBlocksScanned}`);
        console.log(`Profitable Signals:     ${res.opportunitiesFound}`);
        console.log(`Mean Spread:            ${res.avgSpreadBps.toFixed(2)} bps`);
        console.log(`Net Extracted Yield:    ${ethers.formatEther(res.totalSimulatedProfitWei)} WETH`);
        console.log('========================================\n');
    }
}
// CLI Execution Entrypoint
async function main() {
    const rpc = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
    const tester = new HistoricalBacktester(rpc);
    const provider = new ethers.JsonRpcProvider(rpc);
    const currentBlock = await provider.getBlockNumber();
    // Replay past 2,000 Arbitrum blocks (~8-10 minutes of execution history)
    await tester.runBacktest(currentBlock - 2000, currentBlock);
}
main().catch(console.error);
