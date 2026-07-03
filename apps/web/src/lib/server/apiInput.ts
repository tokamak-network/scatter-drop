/**
 * Shared input validation for the unauthenticated API stores (/api/proofs,
 * /api/campaign-meta). These match against ALREADY-LOWERCASED input — the
 * routes normalize with .toLowerCase() before testing — unlike networkInput's
 * case-insensitive ADDR which validates raw admin form input.
 */

export const LOWER_ADDR_RE = /^0x[0-9a-f]{40}$/;
export const ROOT_RE = /^0x[0-9a-f]{64}$/;

/** True for a positive integer chainId (rejects 0, negatives, floats, NaN). */
export function isChainId(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}
