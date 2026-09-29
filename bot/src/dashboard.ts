import blessed from 'blessed';
import { ethers } from 'ethers';

export interface DashboardMetrics {
  activeChain: string;
  activeRpcUrl: string;
  currentRpcLatencyMs: number;
  totalTicksIngested: number;
  dislocationsDetected: number;
  tradesSubmitted: number;
  tradesSettled: number;
  totalProfitSweptWeth: bigint;
  circuitBreakerTripped: boolean;
}

export class ArbiluxDashboard {
  private screen: blessed.Widgets.Screen;
  private headerBox: blessed.Widgets.BoxElement;
  private statusBox: blessed.Widgets.BoxElement;
  private statsBox: blessed.Widgets.BoxElement;
  private logBox: blessed.Widgets.Log;

  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'ARBILUX QUANTITATIVE ENGINE — ARBITRUM ONE',
    });

    // Top Header Banner
    this.headerBox = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{bold}{cyan-fg} ARBILUX QUANT ENGINE {/cyan-fg}{/bold} | Autonomous Arbitrage Pipeline',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
      },
    });

    // Node & Infrastructure Status Box (Left Column)
    this.statusBox = blessed.box({
      top: 3,
      left: 0,
      width: '40%',
      height: 10,
      label: ' Node & Gateway Status ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
      },
    });

    // PnL & Performance Metrics Box (Right Column)
    this.statsBox = blessed.box({
      top: 3,
      left: '40%',
      width: '60%',
      height: 10,
      label: ' Execution & PnL Telemetry ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
      },
    });

    // Scrolling Live Activity Log (Bottom Half)
    this.logBox = blessed.log({
      top: 13,
      left: 0,
      width: '100%',
      height: '100%-13',
      label: ' Live Engine Events ',
      tags: true,
      border: { type: 'line' },
      scrollable: true,
      scrollbar: {
        ch: ' ',
        track: { bg: 'black' },
        style: { inverse: true },
      },
      style: {
        border: { fg: 'white' },
      },
    });

    this.screen.append(this.headerBox);
    this.screen.append(this.statusBox);
    this.screen.append(this.statsBox);
    this.screen.append(this.logBox);

    // Global exit keys (q, Ctrl+C)
    this.screen.key(['q', 'C-c'], () => {
      process.exit(0);
    });

    this.screen.render();
  }

  public updateMetrics(m: DashboardMetrics) {
    const statusContent = [
      `{bold}Target Network:{/bold}     ${m.activeChain}`,
      `{bold}Active RPC:{/bold}         ${m.activeRpcUrl}`,
      `{bold}Sequencer Latency:{/bold}  ${m.currentRpcLatencyMs < 200 ? '{green-fg}' : '{red-fg}'}${m.currentRpcLatencyMs} ms{/}`,
      `{bold}Circuit Breaker:{/bold}    ${m.circuitBreakerTripped ? '{red-fg}TRIPPED{/}' : '{green-fg}NOMINAL (ARMED){/}'}`,
    ].join('\n');

    const statsContent = [
      `{bold}Ticks Processed:{/bold}        ${m.totalTicksIngested.toLocaleString()}`,
      `{bold}Dislocations Found:{/bold}     ${m.dislocationsDetected}`,
      `{bold}Simulated / Submitted:{/bold}  ${m.tradesSubmitted}`,
      `{bold}Settled Flash Loans:{/bold}    {green-fg}${m.tradesSettled}{/green-fg}`,
      `{bold}Net Swept Profit:{/bold}       {yellow-fg}${ethers.formatEther(m.totalProfitSweptWeth)} WETH{/yellow-fg}`,
    ].join('\n');

    this.statusBox.setContent(statusContent);
    this.statsBox.setContent(statsContent);
    this.screen.render();
  }

  public logEvent(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    this.logBox.log(`[${timestamp}] ${message}`);
    this.screen.render();
  }
}
