import { ethers, Interface, Contract } from 'ethers';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { WATCH_POOLS, PoolConfig } from '../config/pools.js';
import { TelemetryBroadcaster } from './wsServer.js';
import { MatrixMatcher, ArbitrageOpportunity } from './matrixMatcher.js';
import { ReceiptEngine, FunnelReceipt } from './receiptEngine.js';
import { ArbiluxRelayer, ExecutionIntent } from './relayer.js';

dotenv.config();

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11'; // Verified Multicall3 on Arbitrum One

const MULTICALL3_ABI = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[] returnData)'
];

const UNISWAP_V3_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
];

const V2_PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

const CAMELOT_PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint16 token0FeePercent, uint16 token1FeePercent)'
];

const EXECUTOR_EVENT_ABI = [
  'event FunnelSettlementReceipt(bytes32 indexed executionId, uint256 indexed timestamp, string assetSymbol, uint256 totalGrossProfit, uint256 btcVaultAllocation, uint256 operatorFuelAllocation, address btcVaultTarget, address fuelTarget)',
  'event ArbitrageExecuted(address indexed asset, uint256 borrowed, uint256 profit, string lender)'
];

// Pre-encoded static calldata selectors for zero-overhead multicall dispatch
const SELECTOR_SLOT0 = '0x3850c7bd';        // slot0()
const SELECTOR_RESERVES = '0x0902f1ac';     // getReserves()

// Static pre-assembled Multicall3 calls array (allocated once in memory)
const STATIC_CALLS = WATCH_POOLS.map((p) => ({
  target: ethers.getAddress(p.poolAddress.toLowerCase()),
  allowFailure: true,
  callData: p.venue === 'UniswapV3' ? SELECTOR_SLOT0 : SELECTOR_RESERVES,
}));

export interface PoolTelemetryItem {
  id: string;
  name: string;
  venue: string;
  price: number;
  formattedPrice: string;
  status: 'ONLINE' | 'THROTTLED';
}

export interface LiveSettledTrade {
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

class ArbiluxEngine {
  private provider: ethers.JsonRpcProvider;
  private wsProvider: ethers.WebSocketProvider | null = null;
  private broadcaster: TelemetryBroadcaster;
  private multicall: ethers.Contract;
  private receiptEngine: ReceiptEngine;
  private relayer: ArbiluxRelayer;
  private executorContract: Contract;
  private currentBlock: number = 384920194;
  private isArmed: boolean = true;
  private executionMode: 'LIVE_MAINNET' = 'LIVE_MAINNET';
  private liveTradeHistory: LiveSettledTrade[] = [];
  private cumulativeLivePnlUsd: number = 0;
  private lastTradePerPair: Map<string, number> = new Map();
  private hurdleBps: number = 35; // Breakeven hurdle > 35 bps
  private signerAddress: string;
  private isProcessing: boolean = false;

  constructor() {
    this.broadcaster = new TelemetryBroadcaster(8545);
    const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
    const builderRpc = process.env.BUILDER_PRIVATE_RPC || 'https://rpc.titanbuilder.xyz';
    const privateKey = process.env.PRIVATE_KEY || '0xac0974bec39a17e368842ea973037457a4e75180dbd052d301d480e0020433e8';
    const executorAddress = process.env.ARBILUX_EXECUTOR_ADDRESS || '0x7b239655daB29D6F54EcBcaa4c2f9Ba02850535E';

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, this.provider);
    this.receiptEngine = new ReceiptEngine();

    // Instantiate Live Mainnet Relayer
    this.relayer = new ArbiluxRelayer(privateKey, executorAddress, rpcUrl, builderRpc);
    this.signerAddress = this.relayer.getWalletAddress();

    // Listen to live on-chain events from deployed executor
    this.executorContract = new Contract(executorAddress, EXECUTOR_EVENT_ABI, this.provider);
    this.listenToOnChainReceipts();

    // Query initial block
    this.provider.getBlockNumber().then(b => { this.currentBlock = b; }).catch(() => {});
  }

  async runBatchCycle(triggeredBlock?: number) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    const cycleStart = performance.now();

    try {
      if (triggeredBlock) {
        this.currentBlock = triggeredBlock;
      }

      // Fast single roundtrip static query for all 50 pools using pre-encoded static calls
      const results = await this.multicall.aggregate3.staticCall(STATIC_CALLS);

      const poolData: PoolTelemetryItem[] = [];

      for (let i = 0; i < results.length; i++) {
        const { success, returnData } = results[i];
        const p = WATCH_POOLS[i];

        if (!success || returnData === '0x' || !returnData || returnData.length < 66) {
          poolData.push({
            id: p.id,
            name: p.name,
            venue: p.venue,
            price: 0,
            formattedPrice: '--',
            status: 'THROTTLED',
          });
          continue;
        }

        try {
          let price = 0;

          if (p.venue === 'UniswapV3') {
            // Direct zero-copy slice: sqrtPriceX96 is the first 32-byte EVM word
            const rawWord = '0x' + returnData.slice(2, 66);
            const sqrtPriceX96 = BigInt(rawWord);
            if (sqrtPriceX96 > 0n) {
              const rawRatio = Number(sqrtPriceX96 * sqrtPriceX96) / Number(2n ** 192n);
              const decimalShift = 10 ** (p.token0.decimals - p.token1.decimals);
              price = rawRatio * decimalShift;
            }
          } else {
            // SushiSwap & Camelot V2: reserve0 is Word 1 (chars 2..66), reserve1 is Word 2 (chars 66..130)
            const r0Big = BigInt('0x' + returnData.slice(2, 66));
            const r1Big = BigInt('0x' + returnData.slice(66, 130));
            const r0 = Number(r0Big) / 10 ** p.token0.decimals;
            const r1 = Number(r1Big) / 10 ** p.token1.decimals;
            price = r0 > 0 ? r1 / r0 : 0;
          }

          if (price > 0) {
            poolData.push({
              id: p.id,
              name: p.name,
              venue: p.venue,
              price,
              formattedPrice: price > 10 ? price.toFixed(2) : price > 0.001 ? price.toPrecision(4) : price.toFixed(6),
              status: 'ONLINE',
            });
          } else {
            throw new Error('Zero price derived');
          }
        } catch {
          poolData.push({
            id: p.id,
            name: p.name,
            venue: p.venue,
            price: 0,
            formattedPrice: '--',
            status: 'THROTTLED',
          });
        }
      }

      // Compute primary WETH benchmark
      const uniWeth = poolData.find((x) => x.id === 'p01')?.price || 0;
      const sushiWeth = poolData.find((x) => x.id === 'p03')?.price || 0;
      const spreadBps = sushiWeth > 0 ? Math.abs((uniWeth - sushiWeth) / sushiWeth) * 10000 : 0;

      // Evaluate cross-venue matrix opportunities
      const opportunities = MatrixMatcher.evaluateOpportunities(poolData);

      // --- LIVE MAINNET EXECUTION PIPELINE ---
      const gasBalance = await this.relayer.getWalletBalanceEth();
      const gasBalanceEthFormatted = ethers.formatEther(gasBalance);
      const isGasFunded = gasBalance > 0n;

      // Inspect highest-spread opportunity exceeding breakeven hurdle (> 35 bps)
      const topOpp = opportunities.find((o) => o.spreadBps >= this.hurdleBps);
      if (topOpp) {
        const now = Date.now();
        const lastExec = this.lastTradePerPair.get(topOpp.pairKey) || 0;
        if (now - lastExec > 6000) {
          this.lastTradePerPair.set(topOpp.pairKey, now);

          if (!isGasFunded) {
            console.log(
              `[DISPATCH READY] Profitable route detected (${topOpp.pairKey} Spread: +${topOpp.spreadBps.toFixed(2)} bps | Net: ~$${topOpp.projectedProfitUsd.toFixed(2)}). Waiting for EOA gas funding to broadcast... (Wallet: ${this.signerAddress})`
            );
          } else {
            console.log(
              `[LIVE DISPATCH] Firing raw execution bundle for ${topOpp.pairKey} (${topOpp.buyVenue} -> ${topOpp.sellVenue} | Spread: +${topOpp.spreadBps.toFixed(2)} bps)...`
            );

            // Construct low-level SwapHop calldata
            const swapHops = [
              {
                venue: topOpp.buyVenue === 'UniswapV3' ? 0 : topOpp.buyVenue === 'SushiSwap' ? 1 : 2,
                tokenIn: topOpp.buyPool.token0.address,
                tokenOut: topOpp.buyPool.token1.address,
                uniFee: topOpp.buyPool.feeTier || 500,
                minAmountOut: 0n,
              },
              {
                venue: topOpp.sellVenue === 'UniswapV3' ? 0 : topOpp.sellVenue === 'SushiSwap' ? 1 : 2,
                tokenIn: topOpp.sellPool.token0.address,
                tokenOut: topOpp.sellPool.token1.address,
                uniFee: topOpp.sellPool.feeTier || 500,
                minAmountOut: 0n,
              },
            ];

            const paramsAbi = new ethers.AbiCoder();
            const encodedParams = paramsAbi.encode(
              ['tuple(uint8 venue, address tokenIn, address tokenOut, uint24 uniFee, uint256 minAmountOut)[]'],
              [swapHops]
            );

            // Flash borrow volume (e.g. 1 WETH nominal or asset scale)
            const borrowAsset = topOpp.buyPool.token0.address;
            const borrowAmount = ethers.parseUnits('1.0', topOpp.buyPool.token0.decimals);

            const intent: ExecutionIntent = {
              asset: borrowAsset,
              amount: borrowAmount,
              params: encodedParams,
              lender: 'BALANCER', // Default to 0% fee Balancer
            };

            // Attempt private flash execution
            this.relayer.dispatchPrivateExecution(intent).then((txHash) => {
              if (txHash) {
                console.log(`[LIVE EXECUTION MINED] TxHash: ${txHash}`);
              }
            }).catch((err) => {
              console.warn('[LIVE DISPATCH ERR]:', err.message || err);
            });
          }
        }
      }

      const recentReceipts = this.receiptEngine.getRecentReceipts(15);

      // Broadcast the batch payload to the Next.js UI
      this.broadcaster.broadcast({
        timestamp: Date.now(),
        pair: '50-POOL DYNAMIC MATRIX',
        uniPrice: uniWeth,
        sushiPrice: sushiWeth,
        spreadBps,
        optimalInputWeth: '0.00',
        projectedProfitWeth: '0.00',
        isExecuting: isGasFunded && topOpp !== undefined,
        circuitBreakerTripped: false,
        recentTx: [],
        pools: poolData,
        opportunities: opportunities.slice(0, 5),
        cumulativePaperPnlUsd: this.cumulativeLivePnlUsd,
        totalPaperTrades: this.liveTradeHistory.length,
        paperJournal: this.liveTradeHistory.slice(0, 10),
        receipts: recentReceipts,
        executionMode: this.executionMode,
        walletBalanceEth: gasBalanceEthFormatted,
        signerAddress: this.signerAddress,
        waitingForGasFunding: !isGasFunded,
      } as any);

      const onlineCount = poolData.filter((x) => x.status === 'ONLINE').length;
      const cycleDurationMs = (performance.now() - cycleStart).toFixed(1);
      console.log(
        `[PUSH INGESTION] Block #${this.currentBlock} | ${cycleDurationMs}ms | ${onlineCount}/${WATCH_POOLS.length} Online | WETH: $${uniWeth.toFixed(2)} | Opps: ${opportunities.length} | Gas: ${gasBalanceEthFormatted} ETH`
      );
    } catch (err: any) {
      console.error('[BATCH SCAN ERROR]:', err.message || err);
    } finally {
      this.isProcessing = false;
    }
  }

  private listenToOnChainReceipts() {
    try {
      this.executorContract.on(
        'FunnelSettlementReceipt',
        (
          executionId: string,
          timestamp: bigint,
          assetSymbol: string,
          totalGrossProfit: bigint,
          btcVaultAllocation: bigint,
          operatorFuelAllocation: bigint,
          btcVaultTarget: string,
          fuelTarget: string,
          event: any
        ) => {
          const grossProfitFormatted = ethers.formatEther(totalGrossProfit);
          const btcAllocFormatted = ethers.formatEther(btcVaultAllocation);
          const fuelAllocFormatted = ethers.formatEther(operatorFuelAllocation);
          const txHash = event?.log?.transactionHash || '0x' + executionId.slice(2, 66);
          const blockNumber = event?.log?.blockNumber || this.currentBlock;

          const receipt: FunnelReceipt = {
            receiptId: `REC-${Date.now()}-${executionId.slice(0, 8)}`,
            txHash,
            blockNumber,
            timestamp: new Date().toISOString(),
            unixTimestamp: Date.now(),
            asset: assetSymbol,
            grossCaptured: `${grossProfitFormatted} ${assetSymbol}`,
            allocations: {
              btcTarget: {
                percentage: '60%',
                amount: btcAllocFormatted,
                destinationAddress: btcVaultTarget || '0xa14950ae717e34d880d1e9ad2ac3151bf2c45429',
                channel: 'Binance Arbitrum Deposit / BTC Vault',
              },
              fuelTarget: {
                percentage: '40%',
                amount: fuelAllocFormatted,
                destinationAddress: fuelTarget || '0x992bE243F6E2c7f53daB1e5D7F8E8f83049F289a',
                channel: 'Bot Relayer Gas Reserve',
              },
            },
            metrics: {
              lenderFeeDeducted: '0.00% (Balancer V2)',
              builderBribePaid: 'Titan Private Relay Bribe',
              netMarginRetained: `${btcAllocFormatted} ${assetSymbol}`,
            },
          };

          this.receiptEngine.generateAndArchiveReceipt(receipt);

          this.cumulativeLivePnlUsd += parseFloat(grossProfitFormatted) * 2700;
          this.liveTradeHistory.unshift({
            id: receipt.receiptId,
            txHash,
            timestamp: Date.now(),
            timeFormatted: new Date().toLocaleTimeString(),
            pairKey: assetSymbol,
            buyVenue: 'UniswapV3',
            sellVenue: 'Camelot',
            buyPrice: 0,
            sellPrice: 0,
            spreadBps: 0,
            borrowVolumeUsd: 10000,
            grossProfitUsd: parseFloat(grossProfitFormatted) * 2700,
            flashLoanFeeUsd: 0,
            dexSwapFeesUsd: 0,
            estimatedGasUsd: 0.35,
            netProfitUsd: parseFloat(btcAllocFormatted) * 2700,
            status: 'SETTLED',
          });

          this.broadcaster.broadcast({
            type: 'NEW_RECEIPT',
            receipt,
          } as any);
        }
      );

      console.log('[RECEIPT ENGINE] Listening to live on-chain FunnelSettlementReceipt events from Executor...');
    } catch (err: any) {
      console.warn('[RECEIPT ENGINE EVENT ERR]:', err.message || err);
    }
  }

  async start() {
    console.log('[MODE] LIVE MAINNET ARMED (Paper trading disabled)');
    console.log(`[WALLET] Signer Address: ${this.signerAddress}`);

    // Initial warm-up query
    await this.runBatchCycle();

    // 1. Primary Ingestion: WebSocket Block Head Subscription (0 ms idle latency)
    const wsUrl = process.env.ARBITRUM_WS_URL || 'wss://arb-mainnet.g.alchemy.com/v2/alch_9xPmo53icKcojfg6xFLSA';
    try {
      this.wsProvider = new ethers.WebSocketProvider(wsUrl);
      console.log(`[WEBSOCKET STREAM] Connected to Arbitrum L2 WebSocket (${wsUrl.split('/')[2]})`);

      this.wsProvider.on('block', async (blockNumber: number) => {
        await this.runBatchCycle(blockNumber);
      });

      this.wsProvider.on('error', (err: any) => {
        console.warn('[WS STREAM RECONNECTING]:', err.message || err);
      });
    } catch (e: any) {
      console.warn('[WS INIT FALLBACK]:', e.message || e);
    }

    // 2. Direct Arbitrum Nitro Sequencer Feed Ingestion (200-400ms head start)
    const sequencerFeedUrl = process.env.ARBITRUM_SEQUENCER_FEED_URL || 'wss://arb1-sequencer.arbitrum.io/feed';
    try {
      const sequencerWs = new WebSocket(sequencerFeedUrl);

      sequencerWs.on('open', () => {
        console.log(`[SEQUENCER FEED] Connected directly to Arbitrum Nitro Sequencer Feed: ${sequencerFeedUrl}`);
      });

      sequencerWs.on('message', async () => {
        // High-frequency sequencer state update: trigger immediate batch evaluation
        if (!this.isProcessing) {
          await this.runBatchCycle();
        }
      });

      sequencerWs.on('error', (err: any) => {
        console.warn('[SEQUENCER FEED NOTICE]:', err.message || 'Connecting to public sequencer fallback...');
      });

      sequencerWs.on('close', () => {
        console.log('[SEQUENCER FEED] Stream closed. WebSocket block header push remains active.');
      });
    } catch (e: any) {
      console.warn('[SEQUENCER FEED INIT]:', e.message || e);
    }

    // 3. Fallback Liveness Heartbeat (2,000ms safety net if network drops packets)
    setInterval(() => {
      if (!this.isProcessing) {
        this.runBatchCycle();
      }
    }, 2000);
  }
}

const engine = new ArbiluxEngine();
engine.start();
