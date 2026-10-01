import fs from 'fs';
import path from 'path';
import { TradeAuditRecord } from './types/audit.js';

export class AuditEngine {
  private auditDir: string;
  private journalPath: string;

  constructor() {
    this.auditDir = path.resolve(process.cwd(), 'audit_logs');
    this.journalPath = path.join(this.auditDir, 'execution_forensics.jsonl');

    if (!fs.existsSync(this.auditDir)) {
      fs.mkdirSync(this.auditDir, { recursive: true });
    }
  }

  recordAttempt(record: TradeAuditRecord): void {
    try {
      // 1. Append to continuous audit ledger (JSONL)
      const line = JSON.stringify(record) + '\n';
      fs.appendFileSync(this.journalPath, line, 'utf-8');

      // 2. Generate detailed single-event forensic file
      const filePath = path.join(this.auditDir, `${record.opportunityId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');

      // 3. Structured terminal forensic summary
      console.log(`\n================= [EXECUTION AUDIT: ${record.opportunityId}] =================`);
      console.log(`Status:           ${record.actual.executionResult === 'SUCCESS' ? '🟢 SUCCESS' : '🔴 ' + record.actual.executionResult}`);
      console.log(`Route:            ${record.route.pair} (${record.route.buyVenue} -> ${record.route.sellVenue})`);
      console.log(`Borrow Volume:    ${record.borrowAmount}`);
      console.log(`Block Timing:     Detected: #${record.blockDetected} | Submitted: #${record.blockSubmitted} | Included: #${record.blockIncluded || 'N/A'}`);
      console.log(`Roundtrip Lat:    ${record.latencyMs.totalRoundtrip} ms (Prep: ${record.latencyMs.detectionToSubmission} ms)`);
      console.log(`Expected Net:     $${record.expected.netProfitUsd.toFixed(2)} (Gross: $${record.expected.grossProfitUsd.toFixed(2)} - L1/L2 Gas: $${(record.expected.l2GasCostUsd + record.expected.l1CalldataCostUsd).toFixed(2)})`);
      console.log(`Actual Realized:  $${(record.actual.actualRealizedProfitUsd || 0).toFixed(2)} | Actual Gas Paid: $${(record.actual.actualGasCostUsd || 0).toFixed(2)}`);
      if (record.actual.revertReason) {
        console.log(`Revert Cause:     ⚠️  ${record.actual.revertReason}`);
      }
      console.log(`======================================================================\n`);
    } catch (err: any) {
      console.error('[AUDIT ENGINE ERROR]:', err.message || err);
    }
  }

  getRecentAuditRecords(limit: number = 20): TradeAuditRecord[] {
    try {
      if (!fs.existsSync(this.journalPath)) return [];
      const content = fs.readFileSync(this.journalPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines
        .slice(-limit)
        .reverse()
        .map((l) => JSON.parse(l) as TradeAuditRecord);
    } catch {
      return [];
    }
  }
}
