'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { 
  Activity, 
  ShieldAlert, 
  Layers, 
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Zap,
  TrendingUp,
  ArrowRight,
  Receipt,
  DollarSign,
  Download,
  FileCheck,
  Microscope,
  Clock,
  ShieldCheck,
  CornerDownRight
} from 'lucide-react';

export interface TradeAuditRecord {
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
  route: {
    pair: string;
    borrowVenue: 'AaveV3' | 'Balancer';
    borrowAsset: string;
    buyVenue: string;
    buyPool: string;
    sellVenue: string;
    sellPool: string;
  };
  borrowAmount: string;
  expected: {
    grossProfitUsd: number;
    dexFeesUsd: number;
    flashLoanFeeUsd: number;
    l2GasCostUsd: number;
    l1CalldataCostUsd: number;
    builderTipUsd: number;
    netProfitUsd: number;
  };
  actual: {
    executionResult: 'SUCCESS' | 'REVERTED' | 'DROPPED_BY_BUILDER';
    txHash?: string;
    l2GasUsed?: string;
    effectiveGasPriceGwei?: string;
    actualGasCostUsd?: number;
    actualRealizedProfitUsd?: number;
    revertReason?: string;
  };
  funnelAttribution?: {
    binanceTreasuryUsd: number;
    operatorFuelUsd: number;
  };
}

interface PoolItem {
  id: string;
  name: string;
  venue: string;
  price: number;
  formattedPrice: string;
  status: 'ONLINE' | 'THROTTLED';
}

interface ArbitrageOpportunity {
  id: string;
  pairKey: string;
  buyVenue: string;
  sellVenue: string;
  buyPrice: number;
  sellPrice: number;
  spreadBps: number;
  projectedProfitUsd: number;
  timestamp: number;
}

interface PaperTrade {
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

export interface FunnelReceipt {
  receiptId: string;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  unixTimestamp: number;
  asset: string;
  grossCaptured: string;
  allocations: {
    btcTarget: {
      percentage: '60%';
      amount: string;
      destinationAddress: string;
      channel: 'Binance Arbitrum Deposit / BTC Vault';
    };
    fuelTarget: {
      percentage: '40%';
      amount: string;
      destinationAddress: string;
      channel: 'Bot Relayer Gas Reserve';
    };
  };
  metrics: {
    lenderFeeDeducted: string;
    builderBribePaid: string;
    netMarginRetained: string;
  };
}

interface TelemetryState {
  spreadBps: number;
  uniPrice: number;
  sushiPrice: number;
  pools?: PoolItem[];
  opportunities?: ArbitrageOpportunity[];
  cumulativePaperPnlUsd?: number;
  totalPaperTrades?: number;
  paperJournal?: PaperTrade[];
  receipts?: FunnelReceipt[];
  type?: string;
  receipt?: FunnelReceipt;
  record?: TradeAuditRecord;
  auditRecords?: TradeAuditRecord[];
  executionMode?: 'LIVE_MAINNET' | 'SIMULATION';
  walletBalanceEth?: string;
  signerAddress?: string;
  waitingForGasFunding?: boolean;
}

export default function GlassTerminal() {
  const [data, setData] = useState<TelemetryState | null>(null);
  const [receipts, setReceipts] = useState<FunnelReceipt[]>([]);
  const [auditRecords, setAuditRecords] = useState<TradeAuditRecord[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [search, setSearch] = useState('');
  const [venueFilter, setVenueFilter] = useState<'ALL' | 'UniswapV3' | 'SushiSwap' | 'Camelot'>('ALL');

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8545');

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => setIsConnected(false);

    ws.onmessage = (event) => {
      try {
        const payload: TelemetryState = JSON.parse(event.data);
        if (payload.type === 'NEW_RECEIPT' && payload.receipt) {
          setReceipts((prev) => [payload.receipt!, ...prev.filter(r => r.receiptId !== payload.receipt!.receiptId)].slice(0, 30));
        } else if (payload.type === 'FORENSIC_RECORD' && payload.record) {
          setAuditRecords((prev) => [payload.record!, ...prev.filter(a => a.opportunityId !== payload.record!.opportunityId)].slice(0, 30));
        } else {
          setData(payload);
          if (payload.receipts && payload.receipts.length > 0) {
            setReceipts((prev) => {
              const combined = [...payload.receipts!, ...prev];
              const unique = Array.from(new Map(combined.map(r => [r.receiptId, r])).values());
              return unique.sort((a, b) => b.unixTimestamp - a.unixTimestamp).slice(0, 30);
            });
          }
          if (payload.auditRecords && payload.auditRecords.length > 0) {
            setAuditRecords((prev) => {
              const combined = [...payload.auditRecords!, ...prev];
              const unique = Array.from(new Map(combined.map(a => [a.opportunityId, a])).values());
              return unique.slice(0, 30);
            });
          }
        }
      } catch (e) {
        console.error('Failed to parse telemetry', e);
      }
    };

    return () => ws.close();
  }, []);

  const filteredPools = useMemo(() => {
    if (!data?.pools) return [];
    return data.pools.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchesVenue = venueFilter === 'ALL' || p.venue === venueFilter;
      return matchesSearch && matchesVenue;
    });
  }, [data?.pools, search, venueFilter]);

  const topOpportunities = data?.opportunities || [];
  const paperJournal = data?.paperJournal || [];
  const cumulativePnl = data?.cumulativePaperPnlUsd || 0;
  const totalTrades = data?.totalPaperTrades || 0;

  return (
    <div className="relative min-h-screen bg-[#0b0d0e] text-white p-6 md:p-10 font-mono selection:bg-white/20">
      {/* Dynamic Ambient Background Glows */}
      <div className="pointer-events-none fixed -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px]" />
      <div className="pointer-events-none fixed top-1/3 -right-40 w-[30rem] h-[30rem] bg-rose-500/10 rounded-full blur-[140px]" />

      <div className="relative max-w-7xl mx-auto space-y-6">
        {/* Navigation & Status Header */}
        <header className="glass-panel rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center h-10 w-10 rounded-xl glass-pill">
              <Layers className="text-white h-5 w-5" />
              <span className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : 'bg-rose-500 shadow-[0_0_12px_#f43f5e]'}`} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-widest text-white flex items-center gap-2">
                ARBILUX <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-neutral-300 font-normal">50-POOL MATRIX</span>
              </h1>
              <p className="text-xs text-neutral-400">Arbitrum One // Batch Multicall3 Engine (0xcA11...CA11)</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="glass-pill px-4 py-2 rounded-xl text-xs flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#10b981] animate-pulse" />
              <span className="text-neutral-400">STATUS:</span>
              <span className="text-emerald-400 font-extrabold tracking-wider">
                {data?.executionMode === 'LIVE_MAINNET' ? 'ARMED (MAINNET)' : 'SIMULATION'}
              </span>
            </div>

            <div className="glass-pill px-4 py-2 rounded-xl text-xs flex items-center gap-2">
              <Zap size={14} className={data?.waitingForGasFunding ? 'text-amber-400 animate-bounce' : 'text-emerald-400'} />
              <span className="text-neutral-400">GAS:</span>
              <span className={data?.waitingForGasFunding ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                {data?.walletBalanceEth !== undefined ? `${parseFloat(data.walletBalanceEth).toFixed(4)} ETH` : '0.0000 ETH'}
              </span>
            </div>

            <div className="glass-pill px-4 py-2 rounded-xl text-xs flex items-center gap-3">
              <span className="text-neutral-400">Socket:</span>
              <span className={isConnected ? 'text-emerald-400 font-bold' : 'text-rose-500 font-bold'}>
                {isConnected ? 'STREAMING 50/50' : 'DISCONNECTED'}
              </span>
            </div>

            <button
              onClick={() => fetch('http://localhost:8080/emergency-halt', { method: 'POST' })}
              className="glass-pill hover:bg-rose-500/20 text-neutral-200 hover:text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition"
            >
              <ShieldAlert size={14} className="text-rose-500" /> HALT
            </button>
          </div>
        </header>

        {/* Paper / Live Execution & PnL Performance Ribbon */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card rounded-2xl p-5 border-l-4 border-l-emerald-500">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>{data?.executionMode === 'LIVE_MAINNET' ? 'REALIZED AUDITED PNL' : 'SIMULATED CUMULATIVE PNL'}</span>
              <DollarSign size={16} className="text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold mt-2 text-emerald-400 tracking-tight">
              +${cumulativePnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              {data?.executionMode === 'LIVE_MAINNET' ? 'Real on-chain verified net yields' : 'Net of Flash Loan (0.05%), DEX fees & Gas ($0.35)'}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 border-l-4 border-l-cyan-500">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>{data?.executionMode === 'LIVE_MAINNET' ? 'EXECUTED ON-CHAIN TRADES' : 'SETTLED PAPER TRADES'}</span>
              <Receipt size={16} className="text-cyan-400" />
            </div>
            <div className="text-2xl font-extrabold mt-2 text-white tracking-tight">
              {totalTrades} Executions
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Hurdle rate &gt; 35.00 bps enforced</div>
          </div>

          <div className="glass-card rounded-2xl p-5 border-l-4 border-l-amber-500">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>60/40 FUNNEL SIZING</span>
              <Zap size={16} className="text-amber-400" />
            </div>
            <div className="text-2xl font-extrabold mt-2 text-white tracking-tight">
              60% BTC / 40% Fuel
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Binance Arbitrum Deposit + Relayer EOA</div>
          </div>
        </section>

        {/* Autonomous Real-Time Receipt Audit Drawer */}
        <section className="glass-panel rounded-2xl p-6 border border-white/[0.08]">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_10px_#10b981]" />
              <h2 className="text-sm font-bold tracking-widest text-white uppercase flex items-center gap-2">
                <FileCheck size={16} className="text-emerald-400" />
                Live Settlement Receipts & Funnel Ledger
              </h2>
            </div>
            <span className="text-xs text-neutral-400">Continuous Sub-Second Stream</span>
          </div>

          <div className="mt-4 space-y-3 max-h-80 overflow-y-auto pr-2">
            {receipts.length > 0 ? (
              receipts.map((r) => (
                <div key={r.receiptId} className="glass-card rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-white/20 transition">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{r.receiptId}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-neutral-300">
                        Block #{r.blockNumber}
                      </span>
                      <span className="text-[10px] text-neutral-500">{new Date(r.unixTimestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-xs text-neutral-400">
                      Tx: <span className="font-mono text-neutral-300">{r.txHash.slice(0, 12)}...{r.txHash.slice(-8)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-xs">
                    {/* 60% Vault Split */}
                    <div className="text-left md:text-right">
                      <div className="text-amber-400 font-bold flex items-center gap-1">
                        <span>60% BTC VAULT:</span>
                        <span>+{r.allocations.btcTarget.amount} {r.asset}</span>
                      </div>
                      <div className="text-[10px] text-neutral-500 truncate max-w-[160px]">
                        {r.allocations.btcTarget.destinationAddress}
                      </div>
                    </div>

                    {/* 40% Fuel Split */}
                    <div className="text-left md:text-right">
                      <div className="text-cyan-400 font-bold flex items-center gap-1">
                        <span>40% FUEL:</span>
                        <span>+{r.allocations.fuelTarget.amount} {r.asset}</span>
                      </div>
                      <div className="text-[10px] text-neutral-500 truncate max-w-[160px]">
                        {r.allocations.fuelTarget.destinationAddress}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const element = document.createElement("a");
                        const file = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
                        element.href = URL.createObjectURL(file);
                        element.download = `${r.receiptId}.json`;
                        document.body.appendChild(element);
                        element.click();
                      }}
                      className="glass-pill px-3 py-1.5 rounded-lg text-xs hover:bg-white/10 text-white transition flex items-center gap-1 cursor-pointer"
                    >
                      <Download size={12} /> Export Receipt
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-neutral-500 text-xs">
                Listening for trade settlements... Receipts will generate and write to `/receipts` automatically.
              </div>
            )}
          </div>
        </section>

        {/* 17-Point High-Fidelity Execution Forensics Drawer */}
        <section className="glass-panel rounded-2xl p-6 border border-white/[0.08]">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_10px_#06b6d4] animate-pulse" />
              <h2 className="text-sm font-bold tracking-widest text-white uppercase flex items-center gap-2">
                <Microscope size={16} className="text-cyan-400" />
                Execution Forensics & Latency Telemetry (17-Point Audit)
              </h2>
            </div>
            <span className="text-xs text-neutral-400">Microsecond Sub-Block Audit Trail</span>
          </div>

          <div className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-2">
            {auditRecords.length > 0 ? (
              auditRecords.map((a) => {
                const isSuccess = a.actual.executionResult === 'SUCCESS';
                const isDropped = a.actual.executionResult === 'DROPPED_BY_BUILDER';
                return (
                  <div key={a.opportunityId} className="glass-card rounded-xl p-4 space-y-3 hover:border-white/20 transition">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          isSuccess
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                            : isDropped
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}>
                          {a.actual.executionResult}
                        </span>
                        <span className="text-xs font-bold text-white font-mono">{a.opportunityId}</span>
                        <span className="text-[10px] text-neutral-400">
                          {new Date(a.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-neutral-300">
                          Blocks: Det #{a.blockDetected} &rarr; Sub #{a.blockSubmitted} &rarr; Inc #{a.blockIncluded || 'N/A'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1 text-cyan-400 font-mono">
                          <Clock size={12} />
                          <span>Roundtrip: {a.latencyMs.totalRoundtrip}ms</span>
                        </div>
                        <button
                          onClick={() => {
                            const element = document.createElement("a");
                            const file = new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' });
                            element.href = URL.createObjectURL(file);
                            element.download = `${a.opportunityId}_forensic.json`;
                            document.body.appendChild(element);
                            element.click();
                          }}
                          className="glass-pill px-2.5 py-1 rounded text-[11px] hover:bg-white/10 text-white transition flex items-center gap-1 cursor-pointer"
                        >
                          <Download size={11} /> Export Forensic
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs pt-1 border-t border-white/[0.04]">
                      {/* Trade Route */}
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Route & Venue</span>
                        <div className="text-white font-semibold flex items-center gap-1">
                          <span>{a.route.pair}</span>
                          <span className="text-neutral-400 text-[10px]">({a.route.borrowVenue})</span>
                        </div>
                        <div className="text-[11px] text-neutral-400 flex items-center gap-1 truncate">
                          <span>{a.route.buyVenue}</span>
                          <span>&rarr;</span>
                          <span>{a.route.sellVenue}</span>
                        </div>
                      </div>

                      {/* Modeled Expected Math */}
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Pre-Flight Modeled</span>
                        <div className="text-emerald-400 font-bold">
                          Expected Net: +${a.expected.netProfitUsd.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          Gross: ${a.expected.grossProfitUsd.toFixed(2)} | Gas: ${(a.expected.l2GasCostUsd + a.expected.l1CalldataCostUsd).toFixed(2)}
                        </div>
                      </div>

                      {/* Actual On-Chain Realized */}
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Actual Realized</span>
                        <div className={isSuccess ? 'text-emerald-400 font-bold' : 'text-neutral-400 font-bold'}>
                          Realized: +${(a.actual.actualRealizedProfitUsd || 0).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          Gas Paid: ${(a.actual.actualGasCostUsd || 0).toFixed(2)} {a.actual.effectiveGasPriceGwei ? `(${a.actual.effectiveGasPriceGwei} gwei)` : ''}
                        </div>
                      </div>

                      {/* Revert Diagnostics / Attribution */}
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                          {isSuccess ? 'Funnel Sweep Split' : 'Revert Diagnostic'}
                        </span>
                        {isSuccess && a.funnelAttribution ? (
                          <div className="text-[11px] space-y-0.5">
                            <span className="text-amber-400 font-semibold">60% BTC: +${a.funnelAttribution.binanceTreasuryUsd.toFixed(2)}</span>
                            <span className="text-cyan-400 font-semibold ml-2">40% Fuel: +${a.funnelAttribution.operatorFuelUsd.toFixed(2)}</span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-rose-400 font-mono truncate" title={a.actual.revertReason}>
                            {a.actual.revertReason || 'No revert recorded'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-neutral-500 text-xs">
                Awaiting execution dispatches... High-fidelity 17-point forensic telemetry will log here in real time.
              </div>
            )}
          </div>
        </section>

        {/* Active Dislocation Opportunities Card */}
        <section className="glass-panel rounded-2xl p-5 border border-white/[0.08]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold tracking-wider text-white">
                ACTIVE DISLOCATION OPPORTUNITIES (CROSS-VENUE)
              </h2>
            </div>
            <span className="text-xs text-neutral-400">
              Hurdle Rate: <span className="text-emerald-400 font-bold">35.00 bps</span>
            </span>
          </div>

          {topOpportunities.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {topOpportunities.map((opp) => {
                const isHurdleMet = opp.spreadBps >= 35;
                return (
                  <div
                    key={opp.id}
                    className={`rounded-xl p-4 transition duration-300 border ${
                      isHurdleMet
                        ? 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)] animate-pulse'
                        : 'bg-white/[0.02] border-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white tracking-wide">{opp.pairKey}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                          isHurdleMet
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        +{opp.spreadBps} bps
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-neutral-500">Buy Venue</span>
                        <span className="text-white font-medium">{opp.buyVenue}</span>
                        <span className="text-[11px] text-emerald-400">${opp.buyPrice > 10 ? opp.buyPrice.toFixed(2) : opp.buyPrice.toPrecision(4)}</span>
                      </div>

                      <ArrowRight size={14} className="text-neutral-500 mx-2" />

                      <div className="flex flex-col text-right">
                        <span className="text-[10px] uppercase text-neutral-500">Sell Venue</span>
                        <span className="text-white font-medium">{opp.sellVenue}</span>
                        <span className="text-[11px] text-rose-400">${opp.sellPrice > 10 ? opp.sellPrice.toFixed(2) : opp.sellPrice.toPrecision(4)}</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-white/[0.04] flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Est. Net Edge ($10k):</span>
                      <span className={`font-bold ${isHurdleMet ? 'text-emerald-400' : 'text-neutral-400'}`}>
                        ${opp.projectedProfitUsd.toFixed(2)} USD
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-neutral-500">
              Cross-matching 50 pools across Uniswap V3, SushiSwap, and Camelot. Awaiting spreads &gt; 15 bps...
            </div>
          )}
        </section>

        {/* Paper Trade Journaling Table */}
        <section className="glass-panel rounded-2xl p-5 border border-white/[0.08]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold tracking-wider text-white">
                SIMULATED (PAPER) EXECUTION JOURNAL
              </h2>
            </div>
            <span className="text-xs text-neutral-400">
              Live Flash Loan Simulation // Net of All Fees
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-neutral-400">
                  <th className="pb-3 font-normal">TIME</th>
                  <th className="pb-3 font-normal">PAIR</th>
                  <th className="pb-3 font-normal">ROUTE</th>
                  <th className="pb-3 font-normal">SPREAD</th>
                  <th className="pb-3 font-normal">GAS</th>
                  <th className="pb-3 font-normal">STATUS</th>
                  <th className="pb-3 font-normal text-right">SIMULATED NET PNL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {paperJournal.length > 0 ? (
                  paperJournal.map((trade) => (
                    <tr key={trade.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3 text-neutral-400 font-mono">{trade.timeFormatted}</td>
                      <td className="py-3 font-bold text-white">{trade.pairKey}</td>
                      <td className="py-3 text-neutral-300">
                        {trade.buyVenue} <span className="text-neutral-500">→</span> {trade.sellVenue}
                      </td>
                      <td className="py-3 text-emerald-400 font-semibold">+{trade.spreadBps} bps</td>
                      <td className="py-3 text-neutral-400 font-mono">${trade.estimatedGasUsd.toFixed(2)}</td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {trade.status}
                        </span>
                      </td>
                      <td className="py-3 text-right font-extrabold text-emerald-400">
                        +${trade.netProfitUsd.toFixed(2)} USD
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-neutral-500 text-xs">
                      Simulated execution engine armed. Monitoring for opportunities crossing the 35.00 bps breakeven hurdle...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Matrix Filter & Search Toolbar */}
        <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Search token pair (e.g. WETH, ARB, GMX)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/20"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {(['ALL', 'UniswapV3', 'SushiSwap', 'Camelot'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVenueFilter(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  venueFilter === v
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic 50-Pool Liquidity Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {filteredPools.length > 0 ? (
            filteredPools.map((pool) => {
              const isZero = pool.price === 0;
              return (
                <div
                  key={pool.id}
                  className="glass-card rounded-xl p-3.5 flex flex-col justify-between hover:border-white/20 transition group"
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-neutral-400">
                      {pool.venue}
                    </span>
                    {pool.status === 'ONLINE' ? (
                      <CheckCircle2 size={12} className="text-emerald-400" />
                    ) : (
                      <AlertCircle size={12} className="text-amber-400" />
                    )}
                  </div>

                  <div className="my-2">
                    <h3 className="text-xs font-bold text-white group-hover:text-emerald-300 transition truncate">
                      {pool.name}
                    </h3>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className={`text-base font-extrabold ${isZero ? 'text-neutral-500' : 'text-emerald-400'}`}>
                        {isZero ? '--' : `$${pool.formattedPrice}`}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/[0.04] flex justify-between items-center text-[10px] text-neutral-500">
                    <span>Pool ID: {pool.id}</span>
                    <span className="text-neutral-400">Live Tick</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-16 text-center text-neutral-500 text-xs">
              {isConnected
                ? 'No pools matching filter criteria.'
                : 'Awaiting Multicall3 aggregate stream from bot engine...'}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
