export interface TradeAuditRecord {
  // Identification & Timings
  opportunityId: string;
  timestamp: string;
  blockDetected: number;
  blockSubmitted: number;
  blockIncluded?: number;
  latencyMs: {
    detectionToSubmission: number;
    submissionToInclusion?: number;
    totalRoundtrip: number;
  };

  // Trade Specifications
  route: {
    pair: string;
    borrowVenue: 'AaveV3' | 'Balancer';
    borrowAsset: string;
    buyVenue: string;
    buyPool: string;
    sellVenue: string;
    sellPool: string;
  };
  borrowAmount: string; // Formatted + Raw Wei

  // Pre-Flight Modeled Expectations (USD & Token)
  expected: {
    grossProfitUsd: number;
    dexFeesUsd: number;
    flashLoanFeeUsd: number;
    l2GasCostUsd: number;
    l1CalldataCostUsd: number;
    builderTipUsd: number;
    netProfitUsd: number;
  };

  // Post-Execution On-Chain Reality
  actual: {
    executionResult: 'SUCCESS' | 'REVERTED' | 'DROPPED_BY_BUILDER';
    txHash?: string;
    l2GasUsed?: string;
    effectiveGasPriceGwei?: string;
    actualGasCostUsd?: number;
    actualRealizedProfitUsd?: number;
    revertReason?: string;
  };

  // Funnel Sweeps (if SUCCESS)
  funnelAttribution?: {
    binanceTreasuryUsd: number; // 60%
    operatorFuelUsd: number;    // 40%
  };
}
