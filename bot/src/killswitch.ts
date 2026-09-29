import fs from 'fs';
import path from 'path';

export function activateEmergencyHalt(reason: string) {
  const haltFilePath = path.resolve(process.cwd(), 'EMERGENCY_HALT.lock');
  const payload = {
    haltedAt: new Date().toISOString(),
    reason: reason,
  };

  fs.writeFileSync(haltFilePath, JSON.stringify(payload, null, 2), 'utf-8');
  console.error(`\n======================================================`);
  console.error(`[CRITICAL] EMERGENCY HALT TRIGGERED: ${reason}`);
  console.error(`Lockfile written to ${haltFilePath}. All execution threads frozen.`);
  console.error(`======================================================\n`);
  process.exit(1);
}

export function isHalted(): boolean {
  return fs.existsSync(path.resolve(process.cwd(), 'EMERGENCY_HALT.lock'));
}
