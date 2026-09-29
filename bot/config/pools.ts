import { ethers } from 'ethers';

export interface Token {
  symbol: string;
  address: string;
  decimals: number;
}

export interface PoolConfig {
  id: string;
  dex: 'UniswapV3' | 'SushiSwap';
  token0: Token;
  token1: Token;
  poolAddress: string;
  feeTier?: number; // Uniswap V3 (e.g. 500 = 0.05%, 3000 = 0.3%)
}

function cleanAddress(addr: string): string {
  return ethers.getAddress(addr.toLowerCase());
}

export const TOKENS = {
  WETH: {
    symbol: 'WETH',
    address: cleanAddress('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'),
    decimals: 18,
  },
  USDC: {
    symbol: 'USDC',
    address: cleanAddress('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'),
    decimals: 6,
  },
  USDCe: {
    symbol: 'USDC.e',
    address: cleanAddress('0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'),
    decimals: 6,
  },
  USDT: {
    symbol: 'USDT',
    address: cleanAddress('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'),
    decimals: 6,
  },
  ARB: {
    symbol: 'ARB',
    address: cleanAddress('0x912CE59144191C1204E64559FE8253a0e49E6548'),
    decimals: 18,
  },
};

// Seed pairs for the core routing loops
export const WATCH_POOLS: PoolConfig[] = [
  // WETH / USDC - Uniswap V3 (0.05%)
  {
    id: 'UNI_V3_WETH_USDC_500',
    dex: 'UniswapV3',
    token0: TOKENS.WETH,
    token1: TOKENS.USDC,
    poolAddress: cleanAddress('0xC6962004f452bE9203591991D15f6b388e09E8D0'),
    feeTier: 500,
  },
  // WETH / USDC - SushiSwap V2 (Native Arbitrum USDC)
  {
    id: 'SUSHI_WETH_USDC',
    dex: 'SushiSwap',
    token0: TOKENS.WETH,
    token1: TOKENS.USDC,
    poolAddress: cleanAddress('0x57b85FEf094e10b5eeCDF350Af688299E9553378'),
  },
  // WETH / USDC.e - SushiSwap V2 (Bridged USDC.e deep pool)
  {
    id: 'SUSHI_WETH_USDCe',
    dex: 'SushiSwap',
    token0: TOKENS.WETH,
    token1: TOKENS.USDCe,
    poolAddress: cleanAddress('0x905dfCD5649217c42684f23958568e533C711Aa3'),
  },
  // WETH / ARB - Uniswap V3 (0.05%)
  {
    id: 'UNI_V3_WETH_ARB_500',
    dex: 'UniswapV3',
    token0: TOKENS.WETH,
    token1: TOKENS.ARB,
    poolAddress: cleanAddress('0xC6F780497A95e246EB9449f5e4770916DCd6396A'),
    feeTier: 500,
  },
  // WETH / ARB - SushiSwap V2
  {
    id: 'SUSHI_WETH_ARB',
    dex: 'SushiSwap',
    token0: TOKENS.ARB,
    token1: TOKENS.WETH,
    poolAddress: cleanAddress('0x17ff9b97a3B2ea10e30946Beb1cf2a4a796E5646'),
  },
];
