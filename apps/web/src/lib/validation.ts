/**
 * True for a positive decimal string with at most `maxDecimals` fractional
 * digits. The decimals cap matches `parseUnits(s, maxDecimals)` so a value with
 * too many fractional digits is rejected here instead of throwing downstream.
 */
export function isPositiveDecimal(s: string, maxDecimals = 18): boolean {
  const match = s.match(/^\d+(?:\.(\d+))?$/);
  if (!match) return false;
  const decimals = match[1]?.length ?? 0;
  return decimals <= maxDecimals && Number(s) > 0;
}
