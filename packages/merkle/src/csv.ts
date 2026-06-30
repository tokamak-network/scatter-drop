import { getAddress, isAddress } from "viem";
import type { AirdropEntry } from "./types.js";

/**
 * Parse a `(address, amount)` CSV into normalized entries.
 *
 * - Accepts an optional header row (`address,amount`).
 * - Skips blank lines; `#`-prefixed lines are comments.
 * - `amount` is parsed as a base-unit integer (wei-like); no decimals.
 * - Addresses are checksum-normalized; invalid rows throw with the line number.
 */
export function parseCsv(text: string): AirdropEntry[] {
  const entries: AirdropEntry[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;

    const cells = line.split(",").map((c) => c.trim());
    if (cells.length < 2) {
      throw new Error(`CSV line ${i + 1}: expected "address,amount"`);
    }

    const [addr, amountStr] = cells;
    // Tolerate a header row.
    if (i === 0 && addr!.toLowerCase() === "address") return;

    if (!isAddress(addr!)) {
      throw new Error(`CSV line ${i + 1}: invalid address "${addr}"`);
    }
    if (!/^\d+$/.test(amountStr!)) {
      throw new Error(`CSV line ${i + 1}: amount must be a base-unit integer, got "${amountStr}"`);
    }

    entries.push({ account: getAddress(addr!), amount: BigInt(amountStr!) });
  });

  return entries;
}
