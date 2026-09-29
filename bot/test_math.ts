import { calculateOptimalInput } from './src/math.js';

console.log('Testing closed-form optimal loan sizing...');

// Test 1: Mismatched pools with dislocation
// Pool 1: 1000 WETH, 3,000,000 USDC ($3000/WETH -> gives more USDC per WETH)
// Pool 2: 2,800,000 USDC, 1000 WETH ($2800/WETH -> WETH is cheaper in pool 2)
// Cycle: Sell WETH in Pool 1 for 3000 USDC each, sell USDC in Pool 2 for WETH at 2800
const r1a = 1000n * 10n ** 18n;
const r1b = 3000000n * 10n ** 6n;
const r2b = 2800000n * 10n ** 6n;
const r2a = 1000n * 10n ** 18n;

const xOpt = calculateOptimalInput(r1a, r1b, r2b, r2a, 5, 30);
console.log(`Test 1 Dislocation: Optimal Input = ${Number(xOpt) / 1e18} WETH`);

if (xOpt > 0n) {
  console.log('[PASS] Mathematical optimal sizing engine correctly computed positive trade volume.');
} else {
  console.error('[FAIL] Expected positive loan size.');
  process.exit(1);
}

// Test 2: Equilibrium pools (no dislocation)
const xEq = calculateOptimalInput(r1a, r1b, r1b, r1a, 5, 30);
console.log(`Test 2 Equilibrium: Optimal Input = ${xEq} (Expected 0)`);
if (xEq === 0n) {
  console.log('[PASS] Zero-loan guard returned 0 for equilibrium market state.');
} else {
  console.error('[FAIL] Expected 0 for equilibrium state.');
  process.exit(1);
}

console.log('All analytical math tests passed successfully!');
