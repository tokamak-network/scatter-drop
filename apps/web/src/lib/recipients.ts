import { isAddress } from "viem";
import {
  buildDrop,
  parseCsv,
  parseHumanAmount,
  type DropManifest,
} from "@tokamak-network/scatter-drop-sdk";

/**
 * Pure recipient-list core for the list builder — CSV <-> rows, dedup, and the
 * distribution math — with no React/UI. The tools page and (soon) the campaign
 * wizard both drive their grids from these functions, so the "how much does
 * each wallet get" logic lives and is tested in exactly one place.
 */

/** One recipient row: an address and its balance/amount, both as raw strings. */
export type Recipient = { address: string; amount: string };

/** A blank trailing row for the editable grid. */
export const BLANK_ROW: Recipient = { address: "", amount: "" };

/** Base-unit integer (no decimal point) — a balance or already-scaled amount. */
const BASE_INT = /^\d+$/;

export function nonEmpty(r: Recipient): boolean {
  return r.address.trim() !== "" || r.amount.trim() !== "";
}

/** Integer square root (Newton's method) — for √balance pro-rata weighting. */
export function isqrt(n: bigint): bigint {
  if (n < 2n) return n < 0n ? 0n : n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** Non-empty rows as `address,amount` CSV lines (trimmed). */
export function rowsToCsv(rows: Recipient[]): string {
  return rows
    .filter(nonEmpty)
    .map((r) => `${r.address.trim()},${r.amount.trim()}`)
    .join("\n");
}

/**
 * Parse CSV/TSV text into rows: strips a BOM, skips blank and `#`-comment
 * lines, unquotes a single leading/trailing quote, and drops a leading
 * `address` header. Always returns at least one (blank) row for the grid.
 */
export function csvToRows(text: string): Recipient[] {
  const rows = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"))
    .map((line) => {
      const [a, b] = line.split(/[,\t]/);
      const address = (a ?? "").trim().replace(/^["']|["']$/g, "");
      const amount = (b ?? "").trim().replace(/^["']|["']$/g, "");
      return { address, amount };
    })
    .filter((r) => !/^address$/i.test(r.address));
  return rows.length ? rows : [{ ...BLANK_ROW }];
}

/**
 * Parse a recipients CSV using the SDK `parseCsv` (single source of truth) and
 * build the Merkle drop, so the caller's tree/root/total match the SDK + claim
 * path exactly. CSV amounts are human token amounts ("1000", "1.5") — the
 * operator's mental model — scaled to base units by the token's `decimals`
 * before they're committed to the tree. `parseCsv` and `buildDrop` throw on
 * malformed/duplicate rows, surfaced as a message instead of crashing the
 * render. Shared by the creation wizard and the operator console's post-hoc
 * republish flow, so both rebuild identical trees from the same CSV.
 */
export function parseRecipients(
  text: string,
  decimals: number,
): {
  manifest: DropManifest | null;
  error: string | null;
} {
  if (!text.trim()) return { manifest: null, error: null };
  try {
    const entries = parseCsv(text, { decimals });
    if (entries.length === 0) return { manifest: null, error: null };
    return { manifest: buildDrop(entries), error: null };
  } catch (e) {
    return { manifest: null, error: e instanceof Error ? e.message : "Invalid CSV" };
  }
}

/** Ensure the grid ends in a blank row to type into. */
export function withTrailingBlank(rows: Recipient[]): Recipient[] {
  const last = rows[rows.length - 1];
  if (!last || nonEmpty(last)) return [...rows, { ...BLANK_ROW }];
  return rows;
}

/** Merge duplicate addresses, summing balances; preserves first-seen order/casing. */
export function dedupSum(rows: Recipient[]): Recipient[] {
  const totals = new Map<string, bigint>();
  const display = new Map<string, string>();
  const order: string[] = [];
  for (const r of rows) {
    const a = r.address.trim();
    if (!isAddress(a, { strict: false })) continue;
    const key = a.toLowerCase();
    const t = r.amount.trim();
    const amt = BASE_INT.test(t) ? BigInt(t) : 0n;
    if (!totals.has(key)) {
      totals.set(key, 0n);
      display.set(key, a);
      order.push(key);
    }
    totals.set(key, (totals.get(key) as bigint) + amt);
  }
  return order.map((key) => ({
    address: display.get(key) as string,
    amount: (totals.get(key) as bigint).toString(),
  }));
}

/** True if any non-empty row has an unparseable address (grid-level block). */
export function hasInvalidAddress(rows: Recipient[]): boolean {
  return rows.some((r) => nonEmpty(r) && !isAddress(r.address.trim(), { strict: false }));
}

/**
 * Count of duplicate valid addresses (case-insensitive) — duplicates break the
 * merkle tree, so a grid blocks until they're merged (see `dedupSum`).
 */
export function duplicateCount(rows: Recipient[]): number {
  const seen = new Set<string>();
  let dups = 0;
  for (const r of rows) {
    const a = r.address.trim().toLowerCase();
    if (!a || !isAddress(a, { strict: false })) continue;
    if (seen.has(a)) dups++;
    else seen.add(a);
  }
  return dups;
}

/**
 * Parse a whole-token input to base units (scaled by `decimals`). Returns null
 * on empty or invalid input, or a non-positive result. Uses the SDK's
 * `parseHumanAmount` — the one grammar shared by CSV rows and form validators
 * (via lib/validation) — so a value can't validate one way and scale another.
 */
export function toBaseUnits(v: string, decimals: number): bigint | null {
  try {
    const b = parseHumanAmount(v.trim(), decimals);
    return b > 0n ? b : null;
  } catch {
    return null;
  }
}

export type DistMode = "equal" | "prorata" | "sqrt";

export type Distribution = {
  /** Airdrop amount (base units) per input row, aligned to `rows`; null = none. */
  airdrops: (bigint | null)[];
  /** Sum of all positive airdrops. */
  total: bigint;
  /** How many rows receive a positive amount. */
  count: number;
};

/**
 * Compute each row's airdrop amount in base units. Inputs are already scaled
 * to base units (use `toBaseUnits` for whole-token entry):
 *  - `equal`: every valid address gets `perWalletBase` (capped by `capBase`).
 *  - `prorata`: `totalBase` split by each row's balance.
 *  - `sqrt`: split by √balance (dampens whales).
 * Row balances are read from `amount` as base-unit integers. The rounding
 * remainder goes to the largest holder so the pro-rata sum stays exact; the
 * cap is applied last (after the remainder) for the pro-rata methods.
 */
export function computeDistribution(
  rows: Recipient[],
  opts: {
    mode: DistMode;
    perWalletBase: bigint | null;
    totalBase: bigint | null;
    capBase: bigint | null;
  },
): Distribution {
  const { mode, perWalletBase, totalBase, capBase } = opts;
  const airdrops: (bigint | null)[] = rows.map(() => null);
  const valid: number[] = [];
  rows.forEach((r, i) => {
    if (isAddress(r.address.trim(), { strict: false })) valid.push(i);
  });

  if (mode === "equal" && perWalletBase !== null) {
    for (const i of valid) {
      airdrops[i] = capBase !== null && perWalletBase > capBase ? capBase : perWalletBase;
    }
  } else if (mode !== "equal" && totalBase !== null) {
    // prorata: weight by balance; sqrt: weight by √balance (dampens whales).
    const weights = valid.map((i) => {
      const b = BASE_INT.test(rows[i].amount.trim()) ? BigInt(rows[i].amount.trim()) : 0n;
      return mode === "sqrt" ? isqrt(b) : b;
    });
    const sumW = weights.reduce((a, b) => a + b, 0n);
    if (sumW > 0n) {
      let assigned = 0n;
      let maxAt = -1;
      let maxW = 0n;
      valid.forEach((i, k) => {
        const w = weights[k];
        if (w > maxW) {
          maxW = w;
          maxAt = i;
        }
        const a = w === 0n ? 0n : (totalBase * w) / sumW;
        airdrops[i] = a;
        assigned += a;
      });
      // Give the rounding remainder to the largest holder so the sum is exact.
      const rem = totalBase - assigned;
      if (rem > 0n && maxAt >= 0) airdrops[maxAt] = (airdrops[maxAt] as bigint) + rem;
      if (capBase !== null) {
        for (const i of valid) {
          const a = airdrops[i];
          if (a !== null && a > capBase) airdrops[i] = capBase;
        }
      }
    }
  }

  let total = 0n;
  let count = 0;
  for (const a of airdrops) {
    if (a !== null && a > 0n) {
      total += a;
      count++;
    }
  }
  return { airdrops, total, count };
}
