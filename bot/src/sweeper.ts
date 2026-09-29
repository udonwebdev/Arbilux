import { ethers, Wallet, Contract } from 'ethers';
import dotenv from 'dotenv';
import { TOKENS } from '../config/pools.js';

dotenv.config();

const EXECUTOR_ABI = [
  'function sweep(address token) external',
  'function owner() external view returns (address)'
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)'
];

export async function runSweepCycle(vaultAddress?: string) {
  const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
  const privateKey = process.env.PRIVATE_KEY;
  const contractAddress = process.env.ARBILUX_EXECUTOR_ADDRESS;

  if (!privateKey || !contractAddress) return;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const executor = new Contract(contractAddress, EXECUTOR_ABI, wallet);

  console.log('[SWEEPER] Checking contract residual balances...');

  const monitoredTokens = [TOKENS.WETH.address, TOKENS.USDC.address, TOKENS.ARB.address];

  for (const tokenAddr of monitoredTokens) {
    try {
      const token = new Contract(tokenAddr, ERC20_ABI, provider);
      const balance = await token.balanceOf(contractAddress);

      if (balance > 0n) {
        const symbol = await token.symbol();
        const decimals = await token.decimals();
        console.log(`[SWEEPER] Balance detected: ${ethers.formatUnits(balance, decimals)} ${symbol}. Initiating sweep...`);

        const tx = await executor.sweep(tokenAddr);
        console.log(`[SWEEPER] Sweep tx submitted: ${tx.hash}`);
        await tx.wait(1);
        console.log(`[SWEEPER] Sweep confirmed for ${symbol}.`);
      }
    } catch (err: any) {
      console.error(`[SWEEPER ERROR] Token ${tokenAddr}:`, err.message || err);
    }
  }
}
