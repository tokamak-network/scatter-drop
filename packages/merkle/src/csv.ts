import { getAddress, isAddress, parseUnits } from "viem";
import type { AirdropEntry } from "./types.js";

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
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`amount must be a token amount like "120" or "1.5", got "${amount}"`);
  }
  const fraction = amount.split(".")[1];
  if (fraction && fraction.length > decimals) {
    throw new Error(`amount "${amount}" has more than ${decimals} decimal places`);
  }
  return parseUnits(amount, decimals);
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
      if (!/^\d+$/.test(amountStr!)) {
        throw new Error(
          `CSV line ${i + 1}: amount must be a base-unit integer, got "${amountStr}"`,
        );
      }
      amount = BigInt(amountStr!);
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
