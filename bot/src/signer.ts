import { ethers, Wallet, HDNodeWallet } from 'ethers';
import fs from 'fs';
import path from 'path';

export interface ISignerVault {
  getAddress(): Promise<string>;
  signTransaction(tx: ethers.TransactionRequest): Promise<string>;
}

export class LocalKeySigner implements ISignerVault {
  private wallet: Wallet | HDNodeWallet;

  constructor(privateKeyOrPath: string, provider?: ethers.Provider) {
    let resolvedKey = privateKeyOrPath;

    // Check if input points to an encrypted keystore JSON file
    if (fs.existsSync(privateKeyOrPath)) {
      const keystoreContent = fs.readFileSync(path.resolve(privateKeyOrPath), 'utf-8');
      const password = process.env.KEYSTORE_PASSWORD || '';
      this.wallet = Wallet.fromEncryptedJsonSync(keystoreContent, password);
    } else {
      this.wallet = new Wallet(resolvedKey);
    }

    if (provider) {
      this.wallet = this.wallet.connect(provider);
    }
  }

  async getAddress(): Promise<string> {
    return this.wallet.getAddress();
  }

  async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
    return this.wallet.signTransaction(tx);
  }

  public getRawWallet(): Wallet | HDNodeWallet {
    return this.wallet;
  }
}
