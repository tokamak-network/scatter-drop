import { getAddress, isAddress, parseUnits } from "viem";
import type { AirdropEntry } from "./types.js";

/** Solidity uint256 ceiling — token amounts can't exceed it on-chain. */
const UINT256_MAX = (1n << 256n) - 1n;

/**
 * Parse a `(address, amount)` CSV into normalized entries.
 *
 * - Accepts an optional header row (`address,amount`).
 * - Skips blank lines; `#`-prefixed lines are comments.
 * - `amount` is a base-unit integer (wei-like) by default; pass
 *   `opts.decimals` to accept human token amounts ("1000", "1.5") scaled by
 *   the token's decimals instead — what operator-facing CSVs contain.
 * - Addresses are checksum-normalized; invalid rows throw with the line number.
 */
/**
 * Parse a human token amount ("120", "1.5") into base units, enforcing the
 * token's decimals explicitly — more fraction digits than the token can
 * represent throws instead of silently rounding. The one grammar for every
 * operator-facing amount input (CSV rows here; the web app's form validators
 * delegate to it so inputs and CSVs accept the same strings).
 */
export function parseHumanAmount(amount: string, decimals: number): bigint {
  // Cap decimals: parseUnits pads the fraction to `decimals` chars, so an
  // absurd value would allocate a huge string. 255 covers every real ERC-20
  // (decimals is a uint8 on-chain).
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error(`decimals must be an integer in [0, 255], got ${decimals}`);
  }
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`amount must be a token amount like "120" or "1.5", got "${amount}"`);
  }
  const [whole, fraction] = amount.split(".");
  // Bound the digit count: the regex is linear but a multi-million-digit
  // integer would make the decimal→BigInt conversion (superlinear in V8) a
  // DoS. uint256 max is 78 digits; nothing legitimate exceeds that.
  if (whole!.length > 78) {
    throw new Error(`amount "${amount}" has too many digits`);
  }
  if (fraction && fraction.length > decimals) {
    throw new Error(`amount "${amount}" has more than ${decimals} decimal places`);
  }
  const scaled = parseUnits(amount, decimals);
  if (scaled > UINT256_MAX) {
    throw new Error(`amount "${amount}" exceeds uint256 max at ${decimals} decimals`);
  }
  return scaled;
}

export function parseCsv(text: string, opts?: { decimals?: number }): AirdropEntry[] {
  const decimals = opts?.decimals;
  const entries: AirdropEntry[] = [];
  // Strip a leading UTF-8 BOM (common in Excel/Windows exports) before splitting.
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;

    const cells = line.split(",").map((c) => c.trim());
    if (cells.length < 2) {
      throw new Error(`CSV line ${i + 1}: expected "address,amount"`);
    }

    const [addr, amountStr] = cells;
    // Tolerate a header row wherever it appears (not just line 0 — blanks/comments
    // may precede it). Detect by content rather than position.
    if (addr!.toLowerCase() === "address" && amountStr!.toLowerCase() === "amount") return;

    if (!isAddress(addr!)) {
      throw new Error(`CSV line ${i + 1}: invalid address "${addr}"`);
    }

    let amount: bigint;
    if (decimals === undefined) {
      // {1,78}: uint256 max is 78 digits; bounding the count keeps the
      // decimal→BigInt conversion (superlinear) from being a DoS on huge input.
      if (!/^\d{1,78}$/.test(amountStr!)) {
        throw new Error(
          `CSV line ${i + 1}: amount must be a base-unit integer (up to 78 digits), got "${amountStr}"`,
        );
      }
      amount = BigInt(amountStr!);
      // 78 digits can still exceed 2^256-1; reject overflow explicitly.
      if (amount > UINT256_MAX) {
        throw new Error(`CSV line ${i + 1}: amount "${amountStr}" exceeds uint256 max`);
      }
    } else {
      try {
        amount = parseHumanAmount(amountStr!, decimals);
      } catch (e) {
        throw new Error(
          `CSV line ${i + 1}: ${e instanceof Error ? e.message : "invalid amount"}`,
        );
      }
    }

    entries.push({ account: getAddress(addr!), amount });
  });

  return entries;
}
