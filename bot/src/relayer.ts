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

export interface ExecutionReceiptResult {
  txHash?: string;
  status: 'SUCCESS' | 'REVERTED' | 'DROPPED_BY_BUILDER';
  blockIncluded?: number;
  gasUsed?: bigint;
  effectiveGasPriceGwei?: string;
  actualGasCostUsd?: number;
  error?: any;
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

  public getWalletAddress(): string {
    return this.wallet.address;
  }

  async getWalletBalanceEth(): Promise<bigint> {
    try {
      return await this.provider.getBalance(this.wallet.address);
    } catch {
      return 0n;
    }
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

  async dispatchPrivateExecution(intent: ExecutionIntent): Promise<ExecutionReceiptResult> {
    const balance = await this.getWalletBalanceEth();
    if (balance === 0n) {
      console.log(`[DISPATCH READY] Profitable route detected. Waiting for EOA gas funding to broadcast... (Wallet: ${this.wallet.address})`);
      return { status: 'DROPPED_BY_BUILDER', error: new Error('INSUFFICIENT_GAS_BALANCE') };
    }

    const isProfitable = await this.simulateLocally(intent);
    if (!isProfitable) {
      return { status: 'REVERTED', error: new Error('SIMULATION_REVERT_NEGATIVE_PNL') };
    }

    try {
      const targetMethod = intent.lender === 'BALANCER' ? 'requestBalancerFlashLoan' : 'requestFlashLoan';
      const estimatedGas = await this.executorContract[targetMethod].estimateGas(
        intent.asset,
        intent.amount,
        intent.params
      );

      const feeData = await this.provider.getFeeData();
      const requiredGasCost = estimatedGas * (feeData.maxFeePerGas || feeData.gasPrice || 100000000n);
      if (balance < requiredGasCost) {
        console.warn(`[INSUFFICIENT GAS] Required: ${ethers.formatEther(requiredGasCost)} ETH | Available: ${ethers.formatEther(balance)} ETH`);
        return { status: 'DROPPED_BY_BUILDER', error: new Error('INSUFFICIENT_GAS_BALANCE') };
      }

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

      const gasUsed = receipt?.gasUsed || 0n;
      const effectiveGasPrice = receipt?.gasPrice ? Number(ethers.formatUnits(receipt.gasPrice, 'gwei')) : 0.1;
      const actualGasCostEth = (Number(gasUsed) * effectiveGasPrice) / 1e9;
      const actualGasCostUsd = actualGasCostEth * 2680;

      return {
        txHash: txResponse.hash,
        status: receipt?.status === 1 ? 'SUCCESS' : 'REVERTED',
        blockIncluded: receipt?.blockNumber,
        gasUsed,
        effectiveGasPriceGwei: effectiveGasPrice.toFixed(4),
        actualGasCostUsd,
      };
    } catch (error: any) {
      console.error('[RELAY ERROR] Dispatch failed:', error.message);
      return {
        status: 'REVERTED',
        error,
      };
    }
  }
}
