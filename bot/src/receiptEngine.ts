import fs from 'fs';
import path from 'path';

export interface FunnelReceipt {
  receiptId: string;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  unixTimestamp: number;
  asset: string;
  grossCaptured: string;
  allocations: {
    btcTarget: {
      percentage: '60%';
      amount: string;
      destinationAddress: string;
      channel: 'Binance Arbitrum Deposit / BTC Vault';
    };
    fuelTarget: {
      percentage: '40%';
      amount: string;
      destinationAddress: string;
      channel: 'Bot Relayer Gas Reserve';
    };
  };
  metrics: {
    lenderFeeDeducted: string;
    builderBribePaid: string;
    netMarginRetained: string;
  };
}

export class ReceiptEngine {
  private receiptsDir: string;
  private logFilePath: string;

  constructor() {
    this.receiptsDir = path.resolve(process.cwd(), 'receipts');
    this.logFilePath = path.join(this.receiptsDir, 'settlement_journal.jsonl');

    if (!fs.existsSync(this.receiptsDir)) {
      fs.mkdirSync(this.receiptsDir, { recursive: true });
    }
  }

  generateAndArchiveReceipt(receipt: FunnelReceipt): void {
    // 1. Write individual instantaneous receipt file
    const receiptFileName = `receipt_${receipt.receiptId}.json`;
    const receiptPath = path.join(this.receiptsDir, receiptFileName);
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf-8');

    // 2. Append to immutable stream journal for high-frequency auditing
    const line = JSON.stringify(receipt) + '\n';
    fs.appendFileSync(this.logFilePath, line, 'utf-8');

    console.log(`[RECEIPT GENERATED] -> #${receipt.receiptId} archived | 60% -> ${receipt.allocations.btcTarget.amount} ${receipt.asset}`);
  }

  getRecentReceipts(limit: number = 20): FunnelReceipt[] {
    try {
      if (!fs.existsSync(this.logFilePath)) return [];
      const lines = fs.readFileSync(this.logFilePath, 'utf-8').trim().split('\n').filter(Boolean);
      return lines.slice(-limit).map(l => JSON.parse(l)).reverse();
    } catch {
      return [];
    }
  }
}
