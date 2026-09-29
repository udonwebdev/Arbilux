export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  wsUrl: string;
  privateRpcUrl: string;
  aaveProvider: string;
  balancerVault: string;
  nativeToken: string;
  tokens: {
    WETH: string;
    USDC: string;
    USDT?: string;
  };
  dexRouters: {
    uniswapV3: string;
    sushiswap?: string;
    aerodrome?: string;
    camelot?: string;
  };
}

export const CHAINS: Record<string, ChainConfig> = {
  arbitrum: {
    name: 'Arbitrum One',
    chainId: 42161,
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    wsUrl: process.env.ARBITRUM_WS_URL || 'wss://arb1.arbitrum.io/feed',
    privateRpcUrl: process.env.BUILDER_PRIVATE_RPC || 'https://rpc.titanbuilder.xyz',
    aaveProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    nativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
    tokens: {
      WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    },
    dexRouters: {
      uniswapV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      sushiswap: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      camelot: '0x1F721E2E82F6676FCE4eA07A5958cF098D339e18',
    },
  },
  base: {
    name: 'Base Mainnet',
    chainId: 8453,
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    wsUrl: process.env.BASE_WS_URL || 'wss://base-rpc.publicnode.com',
    privateRpcUrl: process.env.BASE_BUILDER_RPC || 'https://base.blocknative.com',
    aaveProvider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    nativeToken: '0x4200000000000000000000000000000000000006', // WETH
    tokens: {
      WETH: '0x4200000000000000000000000000000000000006',
      USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
    dexRouters: {
      uniswapV3: '0x2626664c2603336E57B271c5C0b26F421741e481', // SwapRouter02
      aerodrome: '0xcF77a3Ba9A5CA399B7c97c7485615499dd633d42', // Aerodrome Universal Router
    },
  },
};
