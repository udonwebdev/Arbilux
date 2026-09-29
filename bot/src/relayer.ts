import { ethers, Wallet, Contract } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const EXECUTOR_ABI = [
  'function requestBalancerFlashLoan(address asset, uint256 amount, bytes calldata params) external',
  'function requestFlashLoan(address asset, uint256 amount, bytes calldata params) external',
  'function owner() external view returns (address)'
];

export interface ExecutionIntent {
  asset: string;
  amount: bigint;
  params: string;
  lender: 'BALANCER' | 'AAVE';
}

export class ArbiluxRelayer {
  private wallet: Wallet;
  private provider: ethers.JsonRpcProvider;
  private executorContract: Contract;
  private privateRpcUrl: string;

  constructor(privateKey: string, executorAddress: string, rpcUrl: string, privateRpcUrl?: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new Wallet(privateKey, this.provider);
    this.executorContract = new Contract(executorAddress, EXECUTOR_ABI, this.wallet);
    this.privateRpcUrl = privateRpcUrl || 'https://rpc.titanbuilder.xyz';
  }

  async simulateLocally(intent: ExecutionIntent): Promise<boolean> {
    try {
      const targetMethod = intent.lender === 'BALANCER' ? 'requestBalancerFlashLoan' : 'requestFlashLoan';
      await this.executorContract[targetMethod].staticCall(
        intent.asset,
        intent.amount,
        intent.params,
        { from: this.wallet.address }
      );
      console.log(`[SIM] ${intent.lender} dry-run passed. Positive edge confirmed.`);
      return true;
    } catch (err: any) {
      console.warn(`[SIM REVERT] ${intent.lender} execution would revert:`, err.shortMessage || err.message);
      return false;
    }
  }

  async dispatchPrivateExecution(intent: ExecutionIntent): Promise<string | null> {
    const isProfitable = await this.simulateLocally(intent);
    if (!isProfitable) return null;

    try {
      const targetMethod = intent.lender === 'BALANCER' ? 'requestBalancerFlashLoan' : 'requestFlashLoan';
      const estimatedGas = await this.executorContract[targetMethod].estimateGas(
        intent.asset,
        intent.amount,
        intent.params
      );

      const feeData = await this.provider.getFeeData();
      const tx = await this.executorContract[targetMethod].populateTransaction(
        intent.asset,
        intent.amount,
        intent.params,
        {
          gasLimit: (estimatedGas * 125n) / 100n,
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
          type: 2
        }
      );

      const signedTx = await this.wallet.signTransaction(tx);
      const privateProvider = new ethers.JsonRpcProvider(this.privateRpcUrl);
      const txResponse = await privateProvider.broadcastTransaction(signedTx);

      console.log(`[SUBMITTED via ${intent.lender}] Hash: ${txResponse.hash}`);
      const receipt = await txResponse.wait(1);
      console.log(`[MINED] Block: ${receipt?.blockNumber} | Status: ${receipt?.status === 1 ? 'SUCCESS' : 'REVERTED'}`);

      return txResponse.hash;
    } catch (error: any) {
      console.error('[RELAY ERROR] Dispatch failed:', error.message);
      return null;
    }
  }
}
