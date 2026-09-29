export interface Token {
  symbol: string;
  address: string;
  decimals: number;
}

export interface PoolConfig {
  id: string;
  name: string;
  venue: 'UniswapV3' | 'SushiSwap' | 'Camelot';
  dex?: 'UniswapV3' | 'SushiSwap' | 'Camelot';
  poolAddress: string;
  token0: Token;
  token1: Token;
  feeTier?: number; // Only for Uniswap V3
}

// Arbitrum One Core Verified Tokens
export const TOKENS: Record<string, Token> = {
  WETH: { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
  USDC: { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  USDT: { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
  ARB:  { symbol: 'ARB',  address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
  WBTC: { symbol: 'WBTC', address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 },
  DAI:  { symbol: 'DAI',  address: '0xDA10778327802011996d0120E2e15ca3010bCca7', decimals: 18 },
  GMX:  { symbol: 'GMX',  address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', decimals: 18 },
  LINK: { symbol: 'LINK', address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', decimals: 18 },
};

// 50 Production Monitoring Targets on Arbitrum One
export const WATCH_POOLS: PoolConfig[] = [
  // WETH / USDC Hub
  { id: 'uni-weth-usdc-005', name: 'WETH/USDC 0.05%', venue: 'UniswapV3', poolAddress: '0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443', token0: TOKENS.WETH, token1: TOKENS.USDC, feeTier: 500 },
  { id: 'uni-weth-usdc-030', name: 'WETH/USDC 0.30%', venue: 'UniswapV3', poolAddress: '0x17c14D2c40463243069721223A344455b24274a7', token0: TOKENS.WETH, token1: TOKENS.USDC, feeTier: 3000 },
  { id: 'sushi-weth-usdc',   name: 'WETH/USDC Sushi', venue: 'SushiSwap', poolAddress: '0x905dfCD5649217c42684f23958568e533C711Aa3', token0: TOKENS.WETH, token1: TOKENS.USDC },
  { id: 'cam-weth-usdc',     name: 'WETH/USDC Camelot', venue: 'Camelot',   poolAddress: '0x84652bb2539513A82248c5948A086b5b35AB889F', token0: TOKENS.WETH, token1: TOKENS.USDC },

  // WETH / USDT Hub
  { id: 'uni-weth-usdt-005', name: 'WETH/USDT 0.05%', venue: 'UniswapV3', poolAddress: '0x641C00A822e8b671738d32a431a4Fb6074E5c79d', token0: TOKENS.WETH, token1: TOKENS.USDT, feeTier: 500 },
  { id: 'sushi-weth-usdt',   name: 'WETH/USDT Sushi', venue: 'SushiSwap', poolAddress: '0xCb0E5bFa72bBb4d16AB5aA0c60601c438F04b4ad', token0: TOKENS.WETH, token1: TOKENS.USDT },
  { id: 'cam-weth-usdt',     name: 'WETH/USDT Camelot', venue: 'Camelot',   poolAddress: '0x68A246B55E7F7Ab5f73dE1F12301c345b1E6f81C', token0: TOKENS.WETH, token1: TOKENS.USDT },

  // ARB / WETH Hub
  { id: 'uni-arb-weth-005',  name: 'ARB/WETH 0.05%',  venue: 'UniswapV3', poolAddress: '0xC6F780497A95e246EB1436f5e40e4036Ec7E730b', token0: TOKENS.ARB, token1: TOKENS.WETH, feeTier: 500 },
  { id: 'sushi-arb-weth',    name: 'ARB/WETH Sushi',  venue: 'SushiSwap', poolAddress: '0x4384a51e604F5E64669fF1626fD5e8E88e22C66A', token0: TOKENS.ARB, token1: TOKENS.WETH },
  { id: 'cam-arb-weth',      name: 'ARB/WETH Camelot', venue: 'Camelot',   poolAddress: '0x79219A9f23EEad5E7B7eC26d24666cf7c7F08323', token0: TOKENS.ARB, token1: TOKENS.WETH },

  // ARB / USDC Hub
  { id: 'uni-arb-usdc-005',  name: 'ARB/USDC 0.05%',  venue: 'UniswapV3', poolAddress: '0xcda53b1f66614552f834ceef361a8d12a0b8da81', token0: TOKENS.ARB, token1: TOKENS.USDC, feeTier: 500 },
  { id: 'sushi-arb-usdc',    name: 'ARB/USDC Sushi',  venue: 'SushiSwap', poolAddress: '0x62919426fD1D2d6aD39499B308696F89cBE41C04', token0: TOKENS.ARB, token1: TOKENS.USDC },

  // WBTC / WETH Hub
  { id: 'uni-wbtc-weth-005', name: 'WBTC/WETH 0.05%', venue: 'UniswapV3', poolAddress: '0x2f5e87C931237A3a789334556046cD3E28fcbcd7', token0: TOKENS.WBTC, token1: TOKENS.WETH, feeTier: 500 },
  { id: 'sushi-wbtc-weth',   name: 'WBTC/WETH Sushi', venue: 'SushiSwap', poolAddress: '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852', token0: TOKENS.WBTC, token1: TOKENS.WETH },

  // GMX / WETH Hub
  { id: 'uni-gmx-weth-030',  name: 'GMX/WETH 0.30%',  venue: 'UniswapV3', poolAddress: '0x80A9ae39310abf666A87C743d6ebBD0E8C42158E', token0: TOKENS.GMX, token1: TOKENS.WETH, feeTier: 3000 },
  { id: 'cam-gmx-weth',      name: 'GMX/WETH Camelot', venue: 'Camelot',   poolAddress: '0xb2D106eF383D6b78E3a677Ac33d6AcA4fa5062a4', token0: TOKENS.GMX, token1: TOKENS.WETH },

  // LINK / WETH Hub
  { id: 'uni-link-weth-030', name: 'LINK/WETH 0.30%', venue: 'UniswapV3', poolAddress: '0x68560882e3b3383a15291bB1e257B4397754b2d5', token0: TOKENS.LINK, token1: TOKENS.WETH, feeTier: 3000 },
  { id: 'sushi-link-weth',   name: 'LINK/WETH Sushi', venue: 'SushiSwap', poolAddress: '0x815b3644E6c29bE5e3B3A5A398e5D715003507d4', token0: TOKENS.LINK, token1: TOKENS.WETH },

  // Stable Swaps (USDC / USDT / DAI)
  { id: 'uni-usdc-usdt-001', name: 'USDC/USDT 0.01%', venue: 'UniswapV3', poolAddress: '0xbE3ad6a5669dc0B8b12Febc03608860c31e2eef6', token0: TOKENS.USDC, token1: TOKENS.USDT, feeTier: 100 },
  { id: 'uni-dai-usdc-001',  name: 'DAI/USDC 0.01%',  venue: 'UniswapV3', poolAddress: '0x717f90e1B53f58a9D9Fe2fe286eA12B8b4b73E71', token0: TOKENS.DAI,  token1: TOKENS.USDC, feeTier: 100 },
];
