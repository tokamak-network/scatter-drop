/**
 * Shared input validation for the public API stores (/api/proofs,
 * /api/campaign-meta, /api/announcements). These match against
 * ALREADY-LOWERCASED input — the routes normalize with .toLowerCase() before
 * testing — unlike networkInput's case-insensitive ADDR which validates raw
 * admin form input.
 */

export const LOWER_ADDR_RE = /^0x[0-9a-f]{40}$/;

/** 32-byte lowercased hex — merkle roots and transaction hashes. */
const HEX32_RE = /^0x[0-9a-f]{64}$/;
export const ROOT_RE = HEX32_RE;
export const TX_HASH_RE = HEX32_RE;

/** True for a positive integer chainId (rejects 0, negatives, floats, NaN). */
export function isChainId(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}
