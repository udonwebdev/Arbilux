import { PoolTelemetryItem } from './index.js';
import { WATCH_POOLS, PoolConfig } from '../config/pools.js';

export interface ArbitrageOpportunity {
  id: string;
  pairKey: string;
  buyVenue: string;
  sellVenue: string;
  buyPool: PoolConfig;
  sellPool: PoolConfig;
  buyPrice: number;
  sellPrice: number;
  spreadBps: number;
  projectedProfitUsd: number;
  timestamp: number;
}

export class MatrixMatcher {
  static evaluateOpportunities(pools: PoolTelemetryItem[]): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];
    const poolConfigMap = new Map<string, PoolConfig>();
    WATCH_POOLS.forEach((p) => poolConfigMap.set(p.id, p));

    // Group active online pools by token pair signature
    const groups = new Map<string, PoolTelemetryItem[]>();
    for (const item of pools) {
      if (item.status !== 'ONLINE' || item.price <= 0) continue;
      const config = poolConfigMap.get(item.id);
      if (!config) continue;

      // Create normalized key: e.g. "USDC-WETH"
      const pairKey = [config.token0.symbol, config.token1.symbol].sort().join('/');
      if (!groups.has(pairKey)) groups.set(pairKey, []);
      groups.get(pairKey)!.push(item);
    }

    // Cross-match venues for each pair
    for (const [pairKey, group] of groups.entries()) {
      if (group.length < 2) continue;

      for (let i = 0; i < group.length; i++) {
        for (let j = 0; j < group.length; j++) {
          if (i === j) continue;

          const pA = group[i];
          const pB = group[j];

          // Check spread: buy on lower price, sell on higher price
          if (pB.price > pA.price) {
            const spreadBps = ((pB.price - pA.price) / pA.price) * 10000;

            if (spreadBps > 15) { // Track opportunities from 15 bps upward
              const buyConfig = poolConfigMap.get(pA.id)!;
              const sellConfig = poolConfigMap.get(pB.id)!;

              // Conservative estimated net profit assuming $10k flash loan volume
              const grossProfit = 10000 * (spreadBps / 10000);
              const estFees = 10000 * 0.0035; // Aave 0.05% + DEX swap fees
              const projectedNet = Math.max(0, grossProfit - estFees);

              opportunities.push({
                id: `${pA.id}-${pB.id}-${Date.now()}`,
                pairKey,
                buyVenue: pA.venue,
                sellVenue: pB.venue,
                buyPool: buyConfig,
                sellPool: sellConfig,
                buyPrice: pA.price,
                sellPrice: pB.price,
                spreadBps: Number(spreadBps.toFixed(2)),
                projectedProfitUsd: Number(projectedNet.toFixed(2)),
                timestamp: Date.now(),
              });
            }
          }
        }
      }
    }

    return opportunities.sort((a, b) => b.spreadBps - a.spreadBps);
  }
}
