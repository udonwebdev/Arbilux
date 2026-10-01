import { ArbitrageOpportunity } from './matrixMatcher.js';

export interface PaperTrade {
  id: string;
  txHash: string;
  timestamp: number;
  timeFormatted: string;
  pairKey: string;
  buyVenue: string;
  sellVenue: string;
  buyPrice: number;
  sellPrice: number;
  spreadBps: number;
  borrowVolumeUsd: number;
  grossProfitUsd: number;
  flashLoanFeeUsd: number;
  dexSwapFeesUsd: number;
  estimatedGasUsd: number;
  netProfitUsd: number;
  status: 'SETTLED' | 'REVERTED_SIM';
}

export class PaperExecutionEngine {
  private cumulativePnlUsd: number = 0;
  private trades: PaperTrade[] = [];
  private lastTradePerPair: Map<string, number> = new Map();
  private hurdleBps: number = 35; // Breakeven hurdle > 35 bps
  private defaultVolumeUsd: number = 10000;

  processOpportunities(opportunities: ArbitrageOpportunity[]): PaperTrade | null {
    const now = Date.now();

    for (const opp of opportunities) {
      if (opp.spreadBps < this.hurdleBps) continue;

      // Rate limit per pair to avoid repeating identical block dislocation (e.g. 5s cooldown)
      const lastExec = this.lastTradePerPair.get(opp.pairKey) || 0;
      if (now - lastExec < 5000) continue;

      // Simulate flash loan execution on Arbitrum One
      const volume = this.defaultVolumeUsd;
      const grossProfit = volume * (opp.spreadBps / 10000);
      const flashLoanFee = volume * 0.0005; // Aave V3 0.05% fee (or 0% Balancer V2)
      const dexSwapFees = volume * 0.0030;  // 0.30% estimated DEX swap fees
      const estimatedGas = 0.35;            // ~$0.35 L2 execution + L1 calldata on Arbitrum

      const netProfit = grossProfit - (flashLoanFee + dexSwapFees + estimatedGas);

      if (netProfit > 0) {
        this.lastTradePerPair.set(opp.pairKey, now);

        // Generate synthetic transaction hash
        const syntheticTxHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

        const trade: PaperTrade = {
          id: `pt-${now}-${Math.floor(Math.random() * 1000)}`,
          txHash: syntheticTxHash,
          timestamp: now,
          timeFormatted: new Date(now).toLocaleTimeString(),
          pairKey: opp.pairKey,
          buyVenue: opp.buyVenue,
          sellVenue: opp.sellVenue,
          buyPrice: opp.buyPrice,
          sellPrice: opp.sellPrice,
          spreadBps: opp.spreadBps,
          borrowVolumeUsd: volume,
          grossProfitUsd: Number(grossProfit.toFixed(2)),
          flashLoanFeeUsd: Number(flashLoanFee.toFixed(2)),
          dexSwapFeesUsd: Number(dexSwapFees.toFixed(2)),
          estimatedGasUsd: estimatedGas,
          netProfitUsd: Number(netProfit.toFixed(2)),
          status: 'SETTLED',
        };

        this.cumulativePnlUsd += trade.netProfitUsd;
        this.trades.unshift(trade);
        if (this.trades.length > 30) this.trades.pop();

        console.log(`[PAPER EXECUTION] SETTLED: ${opp.pairKey} | Spread: +${opp.spreadBps} bps | Net PnL: +$${trade.netProfitUsd} | Cumulative: $${this.cumulativePnlUsd.toFixed(2)}`);
        return trade;
      }
    }

    return null;
  }

  getCumulativePnl(): number {
    return Number(this.cumulativePnlUsd.toFixed(2));
  }

  getTradeHistory(): PaperTrade[] {
    return this.trades;
  }

  getTotalTradeCount(): number {
    return this.trades.length;
  }
}
