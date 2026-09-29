import { Wallet } from 'ethers';
import fs from 'fs';
import path from 'path';
export class LocalKeySigner {
    wallet;
    constructor(privateKeyOrPath, provider) {
        let resolvedKey = privateKeyOrPath;
        // Check if input points to an encrypted keystore JSON file
        if (fs.existsSync(privateKeyOrPath)) {
            const keystoreContent = fs.readFileSync(path.resolve(privateKeyOrPath), 'utf-8');
            const password = process.env.KEYSTORE_PASSWORD || '';
            this.wallet = Wallet.fromEncryptedJsonSync(keystoreContent, password);
        }
        else {
            this.wallet = new Wallet(resolvedKey);
        }
        if (provider) {
            this.wallet = this.wallet.connect(provider);
        }
    }
    async getAddress() {
        return this.wallet.getAddress();
    }
    async signTransaction(tx) {
        return this.wallet.signTransaction(tx);
    }
    getRawWallet() {
        return this.wallet;
    }
}
