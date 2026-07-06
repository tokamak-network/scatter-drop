import { parseHumanAmount } from "@tokamak-network/scatter-drop-sdk";

/**
 * True for a positive decimal string with at most `maxDecimals` fractional
 * digits. Delegates to the SDK's `parseHumanAmount` — the same grammar the
 * recipients-CSV parser uses — so form inputs and CSV rows can never drift
 * on what counts as a valid amount.
 */
export function isPositiveDecimal(s: string, maxDecimals = 18): boolean {
  try {
    return parseHumanAmount(s, maxDecimals) > 0n;
  } catch {
    return false;
  }
}
