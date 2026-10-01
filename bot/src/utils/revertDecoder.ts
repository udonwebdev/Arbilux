import { ethers, Interface } from 'ethers';

const COMMON_REVERT_INTERFACES = new Interface([
  'function Error(string message)',
  'function Panic(uint256 code)',
  'error InsufficientOutput(uint256 expected, uint256 actual)',
  'error SlippageExceeded()',
  'error RepaymentFailed()',
  'error BreakevenHurdleNotMet(int256 netProfit)',
  'error NegativePnL(uint256 expectedBalance, uint256 actualBalance)',
  'error UnauthorizedCaller()',
  'error InvalidVenue()'
]);

export function decodeTransactionRevert(error: any): string {
  if (!error) return 'UNKNOWN_ERROR';
  
  // Extract custom error hex payload if available
  const errorData = error.data || error.error?.data || (typeof error === 'string' ? error : null);

  if (typeof errorData === 'string' && errorData.startsWith('0x') && errorData.length >= 10) {
    try {
      const decoded = COMMON_REVERT_INTERFACES.parseError(errorData);
      if (decoded) {
        return `${decoded.name}(${decoded.args.map((a: any) => a.toString()).join(', ')})`;
      }
    } catch {
      // Not in common interfaces; try standard string parse
      try {
        const decoded = COMMON_REVERT_INTERFACES.decodeFunctionResult('Error', errorData);
        return `Error("${decoded[0]}")`;
      } catch {
        return `RawRevertHex(${errorData.slice(0, 18)}...)`;
      }
    }
  }

  // Fallback to error message string matching
  const msg = error.shortMessage || error.message || '';
  if (msg.includes('insufficient funds')) return 'INSUFFICIENT_GAS_BALANCE';
  if (msg.includes('nonce too low')) return 'NONCE_COLLISION';
  if (msg.includes('replacement transaction underpriced')) return 'REPLACED_UNDERPRICED';
  if (msg.includes('execution reverted')) return 'SEQUENCER_REVERT_SLIPPAGE';

  return msg.slice(0, 120);
}
