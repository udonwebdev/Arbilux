'use client';

import React, { useEffect, useState } from 'react';
import { 
  Activity, 
  ShieldAlert, 
  Zap, 
  TrendingUp, 
  RefreshCw, 
  Terminal, 
  ExternalLink,
  Layers,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';

interface TelemetryState {
  pair: string;
  uniPrice: number;
  sushiPrice: number;
  spreadBps: number;
  optimalInputWeth: string;
  projectedProfitWeth: string;
  isExecuting: boolean;
  circuitBreakerTripped: boolean;
  recentTx: {
    hash: string;
    profit: string;
    lender: string;
    status: string;
    time: string;
  }[];
}

export default function GlassTerminal() {
  const [data, setData] = useState<TelemetryState | null>(null);
  const [history, setHistory] = useState<{ time: string; spread: number; priceUni: number; priceSushi: number }[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket;
    try {
      ws = new WebSocket('ws://localhost:8545');

      ws.onopen = () => setIsConnected(true);
      ws.onclose = () => setIsConnected(false);
      ws.onerror = () => setIsConnected(false);

      ws.onmessage = (event) => {
        try {
          const payload: TelemetryState = JSON.parse(event.data);
          setData(payload);

          setHistory((prev) => [
            ...prev.slice(-30),
            {
              time: new Date().toLocaleTimeString().slice(3, 8),
              spread: Number(payload.spreadBps.toFixed(2)),
              priceUni: Number(payload.uniPrice.toFixed(2)),
              priceSushi: Number(payload.sushiPrice.toFixed(2)),
            },
          ]);
        } catch (e) {
          console.error('Failed to parse telemetry', e);
        }
      };
    } catch (err) {
      console.warn('WebSocket connection attempt failed:', err);
    }

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const spread = data?.spreadBps ?? 0;
  const isProfitableSpread = spread >= 35; // Breakeven hurdle (Uni + Sushi + Flash fee)

  return (
    <div className="relative min-h-screen bg-[#0b0d0e] text-white p-6 md:p-10 font-mono selection:bg-white/20 overflow-hidden">
      {/* Dynamic Ambient Glass Glow Orbs */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px]" />
      <div className="pointer-events-none absolute top-1/3 -right-40 w-[30rem] h-[30rem] bg-rose-500/10 rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/3 w-[35rem] h-[35rem] bg-white/[0.03] rounded-full blur-[160px]" />

      <div className="relative max-w-7xl mx-auto space-y-6">
        {/* Glass Navigation Header */}
        <header className="glass-panel rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center h-10 w-10 rounded-xl glass-pill">
              <Layers className="text-white h-5 w-5" />
              <span className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : 'bg-rose-500 shadow-[0_0_12px_#f43f5e]'}`} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-widest text-white flex items-center gap-2">
                ARBILUX <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-neutral-300 font-normal">v2.0 GLASS</span>
              </h1>
              <p className="text-xs text-neutral-400">Arbitrum One // Concentrated Liquidity Dynamic Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="glass-pill px-4 py-2 rounded-xl text-xs flex items-center gap-3">
              <span className="text-neutral-400">Socket:</span>
              <span className={isConnected ? 'text-emerald-400 font-bold' : 'text-rose-500 font-bold'}>
                {isConnected ? 'STREAMING' : 'DISCONNECTED'}
              </span>
            </div>

            <button
              onClick={() => fetch('http://localhost:8080/emergency-halt', { method: 'POST' }).catch(() => {})}
              className="group glass-pill hover:bg-rose-500/20 hover:border-rose-500/40 text-neutral-200 hover:text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition duration-200 cursor-pointer"
            >
              <ShieldAlert size={14} className="text-rose-500 group-hover:scale-110 transition" />
              HALT ENGINE
            </button>
          </div>
        </header>

        {/* Live Pair Price Simulators (Red vs Green Divergence) */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Venue 1: Uniswap V3 */}
          <div className="glass-card rounded-2xl p-6 border-l-4 border-l-emerald-500">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs text-neutral-400 tracking-wider">PRIMARY LEG (UNISWAP V3)</span>
                <h3 className="text-white text-xl font-bold mt-1">WETH / USDC</h3>
              </div>
              <div className="flex items-center gap-1 text-emerald-400 text-xs glass-pill px-2.5 py-1 rounded-lg">
                <ArrowUpRight size={14} /> BUY VENUE
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-white tracking-tight">
                ${data ? data.uniPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </span>
              <span className="text-xs text-emerald-400 font-medium">Slot0 Tick Sync</span>
            </div>
          </div>

          {/* Venue 2: SushiSwap V2 */}
          <div className="glass-card rounded-2xl p-6 border-l-4 border-l-rose-500">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs text-neutral-400 tracking-wider">COUNTER LEG (SUSHISWAP V2)</span>
                <h3 className="text-white text-xl font-bold mt-1">WETH / USDC</h3>
              </div>
              <div className="flex items-center gap-1 text-rose-500 text-xs glass-pill px-2.5 py-1 rounded-lg">
                <ArrowDownRight size={14} /> SELL VENUE
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-white tracking-tight">
                ${data ? data.sushiPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </span>
              <span className="text-xs text-rose-500 font-medium">Reserves CPMM</span>
            </div>
          </div>
        </section>

        {/* Real-Time Quantitative Metrics */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Spread Bps */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>SPREAD DISLOCATION</span>
              <Activity size={14} className={isProfitableSpread ? 'text-emerald-400' : 'text-neutral-500'} />
            </div>
            <div className={`text-2xl font-bold mt-2 ${isProfitableSpread ? 'text-emerald-400' : 'text-rose-500'}`}>
              {data ? `${data.spreadBps.toFixed(2)} bps` : '--'}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Hurdle Rate: 35.00 bps</div>
          </div>

          {/* Sizing Engine */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>OPTIMAL BORROW (x*)</span>
              <Zap size={14} className="text-white" />
            </div>
            <div className="text-2xl font-bold mt-2 text-white">
              {data ? `${data.optimalInputWeth} WETH` : '0.00 WETH'}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Analytical closed-form calculus</div>
          </div>

          {/* Projected Profit */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>PROJECTED NET EDGE</span>
              <TrendingUp size={14} className={isProfitableSpread ? 'text-emerald-400' : 'text-neutral-500'} />
            </div>
            <div className={`text-2xl font-bold mt-2 ${Number(data?.projectedProfitWeth || 0) > 0 ? 'text-emerald-400' : 'text-neutral-400'}`}>
              {data ? `${data.projectedProfitWeth} WETH` : '0.0000 WETH'}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Net of lender tip & gas</div>
          </div>

          {/* Protection Circuit */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>CIRCUIT BREAKER</span>
              <RefreshCw size={14} className="text-neutral-400" />
            </div>
            <div className="text-2xl font-bold mt-2">
              {data?.circuitBreakerTripped ? (
                <span className="text-rose-500 font-extrabold drop-shadow-[0_0_8px_#f43f5e]">TRIPPED</span>
              ) : (
                <span className="text-emerald-400 font-extrabold drop-shadow-[0_0_8px_#10b981]">ARMED</span>
              )}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Zero open allowance active</div>
          </div>
        </section>

        {/* Live Glass Graph Area */}
        <section className="glass-panel rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold tracking-wider text-white">LIVE ARBITRAGE VOLATILITY SPREAD</h2>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> In-Money (&gt; 35 bps)
              </span>
              <span className="flex items-center gap-1.5 text-rose-500">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Equilibrium
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="spreadGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isProfitableSpread ? '#10b981' : '#f43f5e'} stopOpacity={0.35}/>
                    <stop offset="95%" stopColor={isProfitableSpread ? '#10b981' : '#f43f5e'} stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="time" stroke="#737373" fontSize={11} tickLine={false} />
                <YAxis stroke="#737373" fontSize={11} tickLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 17, 19, 0.85)',
                    backdropFilter: 'blur(16px)',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    color: '#ffffff',
                    boxShadow: '0 8px 32px 0 rgba(0,0,0,0.5)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="spread"
                  stroke={isProfitableSpread ? '#10b981' : '#f43f5e'}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#spreadGradient)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Live Execution Stream */}
        <section className="glass-panel rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Terminal className="h-4 w-4 text-white" />
            <h2 className="text-sm font-semibold tracking-wider text-white">ATOMIC ARBITRAGE LOGS</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-neutral-400">
                  <th className="pb-3 font-normal">TIME</th>
                  <th className="pb-3 font-normal">LENDER</th>
                  <th className="pb-3 font-normal">TX HASH</th>
                  <th className="pb-3 font-normal">STATUS</th>
                  <th className="pb-3 font-normal text-right">NET CAPTURED</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data?.recentTx && data.recentTx.length > 0 ? (
                  data.recentTx.map((tx, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition">
                      <td className="py-3 text-neutral-400">{tx.time}</td>
                      <td className="py-3 text-white font-medium">{tx.lender}</td>
                      <td className="py-3 text-white flex items-center gap-1.5">
                        <span className="font-mono text-neutral-300">{tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}</span>
                        <a
                          href={`https://arbiscan.io/tx/${tx.hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-neutral-500 hover:text-white transition"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            tx.status === 'SUCCESS'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 text-right font-bold text-emerald-400">
                        +{tx.profit} WETH
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-500">
                      Engine monitoring Arbitrum One sequencer. Waiting for eligible price dislocations...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
