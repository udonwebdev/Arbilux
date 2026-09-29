import { WebSocketProvider, Interface } from 'ethers';
import dotenv from 'dotenv';
import { WATCH_POOLS } from '../config/pools.js';
dotenv.config();
const UNI_V3_INTERFACE = new Interface([
    'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
]);
const SUSHI_V2_INTERFACE = new Interface([
    'event Sync(uint112 reserve0, uint112 reserve1)'
]);
export class StateStreamer {
    wsProvider;
    stateCache = new Map();
    constructor(wsUrl) {
        this.wsProvider = new WebSocketProvider(wsUrl);
    }
    init() {
        console.log('[STREAM] Connecting low-latency WebSocket feed...');
        for (const pool of WATCH_POOLS) {
            this.stateCache.set(pool.poolAddress.toLowerCase(), {
                lastUpdated: Date.now()
            });
            if (pool.venue === 'UniswapV3') {
                const filter = {
                    address: pool.poolAddress,
                    topics: [UNI_V3_INTERFACE.getEvent('Swap').topicHash]
                };
                this.wsProvider.on(filter, (log) => {
                    const parsed = UNI_V3_INTERFACE.parseLog(log);
                    if (parsed) {
                        const current = this.stateCache.get(pool.poolAddress.toLowerCase()) || { lastUpdated: 0 };
                        current.sqrtPriceX96 = BigInt(parsed.args.sqrtPriceX96);
                        current.lastUpdated = Date.now();
                        this.stateCache.set(pool.poolAddress.toLowerCase(), current);
                    }
                });
            }
            else if (pool.venue === 'SushiSwap' || pool.venue === 'Camelot') {
                const filter = {
                    address: pool.poolAddress,
                    topics: [SUSHI_V2_INTERFACE.getEvent('Sync').topicHash]
                };
                this.wsProvider.on(filter, (log) => {
                    const parsed = SUSHI_V2_INTERFACE.parseLog(log);
                    if (parsed) {
                        const current = this.stateCache.get(pool.poolAddress.toLowerCase()) || { lastUpdated: 0 };
                        current.reserve0 = BigInt(parsed.args.reserve0);
                        current.reserve1 = BigInt(parsed.args.reserve1);
                        current.lastUpdated = Date.now();
                        this.stateCache.set(pool.poolAddress.toLowerCase(), current);
                    }
                });
            }
        }
        console.log(`[STREAM] Subscribed to logs across ${WATCH_POOLS.length} liquidity venues.`);
    }
    getState(poolAddress) {
        return this.stateCache.get(poolAddress.toLowerCase());
    }
}
