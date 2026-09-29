import { ethers, Interface } from 'ethers';
import { WATCH_POOLS, PoolConfig } from '../config/pools.js';

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

const MULTICALL3_ABI = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[] returnData)'
];

const UNISWAP_V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
];

const V2_PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

export interface ScannedPoolResult {
  pool: PoolConfig;
  price: number;
  reserve0?: bigint;
  reserve1?: bigint;
}

export class BatchPoolScanner {
  private multicall: ethers.Contract;
  private uniInterface: Interface;
  private v2Interface: Interface;

  constructor(provider: ethers.Provider) {
    const multicallAddr = ethers.getAddress(MULTICALL3_ADDRESS.toLowerCase());
    this.multicall = new ethers.Contract(multicallAddr, MULTICALL3_ABI, provider);
    this.uniInterface = new Interface(UNISWAP_V3_POOL_ABI);
    this.v2Interface = new Interface(V2_PAIR_ABI);
  }

  async scanAllPools(): Promise<ScannedPoolResult[]> {
    const calls = WATCH_POOLS.map((p) => {
      const isUni = p.venue === 'UniswapV3';
      const callData = isUni
        ? this.uniInterface.encodeFunctionData('slot0')
        : this.v2Interface.encodeFunctionData('getReserves');

      return {
        target: ethers.getAddress(p.poolAddress.toLowerCase()),
        allowFailure: true,
        callData,
      };
    });

    // 1 single RPC call for all pools
    const results = await this.multicall.aggregate3.staticCall(calls);

    const scanned: ScannedPoolResult[] = [];

    for (let i = 0; i < results.length; i++) {
      const { success, returnData } = results[i];
      if (!success || returnData === '0x') continue;

      const p = WATCH_POOLS[i];
      try {
        if (p.venue === 'UniswapV3') {
          const [sqrtPriceX96] = this.uniInterface.decodeFunctionResult('slot0', returnData);
          const rawRatio = Number(BigInt(sqrtPriceX96) * BigInt(sqrtPriceX96)) / Number(2n ** 192n);
          const decimalShift = 10 ** (p.token0.decimals - p.token1.decimals);
          const price = rawRatio * decimalShift;
          scanned.push({ pool: p, price });
        } else {
          const [reserve0, reserve1] = this.v2Interface.decodeFunctionResult('getReserves', returnData);
          const r0 = Number(reserve0) / 10 ** p.token0.decimals;
          const r1 = Number(reserve1) / 10 ** p.token1.decimals;
          const price = r1 / r0;
          scanned.push({ pool: p, price, reserve0: BigInt(reserve0), reserve1: BigInt(reserve1) });
        }
      } catch {
        continue;
      }
    }

    return scanned;
  }
}
