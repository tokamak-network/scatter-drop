/**
 * Dune import — operators run a holder-balances query on their OWN Dune account
 * (BYO API key, so the app never needs a paid Dune plan) and paste the results
 * URL here. This module fetches that URL server-side, follows `next_uri`
 * pagination to collect every row, and normalizes to `{ address, amount }` for
 * the recipient-list builder.
 *
 * Server-only: the pasted URL carries the operator's Dune api_key in its query
 * string, so this MUST run behind the /api/dune route (never a client fetch —
 * Dune's API also isn't CORS-open to browsers, and pagination is cleaner here).
 */

import { isAddress } from "viem";

/** Only ever fetch Dune's API host — an SSRF guard on the operator-supplied URL. */
const DUNE_HOST = "api.dune.com";
/** Hard cap on collected rows (bounds memory + the operator's Dune credits). */
const MAX_ROWS = 100_000;
/** Backstop on pagination hops in case `next_uri` ever loops. */
const MAX_PAGES = 500;

export interface DuneRow {
  address: string;
  amount: string;
}

export interface DuneImportResult {
  rows: DuneRow[];
  /** Total rows reported by Dune (may exceed `rows.length` when truncated). */
  total: number;
  /** True when MAX_ROWS capped the collection before all rows were read. */
  truncated: boolean;
}

/**
 * Validate an operator-supplied Dune URL. Returns the parsed URL when it is a
 * plain `https://api.dune.com/...` results endpoint, else an error string. The
 * host check is the SSRF guard — we refuse to fetch anything off Dune.
 */
export function parseDuneUrl(raw: unknown): URL | { error: string } {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { error: "Paste your Dune results API URL." };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "Not a valid URL." };
  }
  if (url.protocol !== "https:") return { error: "URL must use https." };
  if (url.hostname !== DUNE_HOST) {
    return { error: `URL host must be ${DUNE_HOST}.` };
  }
  if (!/\/results\/?$/.test(url.pathname)) {
    return {
      error:
        "Use the query results endpoint (…/results?api_key=…), not the query page URL.",
    };
  }
  if (!url.searchParams.get("api_key")) {
    return { error: "URL is missing its api_key parameter." };
  }
  return url;
}

/** A Dune JSON page — only the fields we read. */
interface DunePage {
  result?: {
    rows?: Record<string, unknown>[];
    metadata?: { column_names?: string[]; total_row_count?: number };
  };
  next_uri?: string | null;
  error?: string;
}

/**
 * Pick the address and amount columns from Dune's `column_names` by name — the
 * template query returns `address` + `balance`, and the alternatives cover
 * common renames so an operator's tweaked query still imports.
 */
function pickColumns(
  columns: string[],
): { addressCol: string; amountCol: string } | { error: string } {
  const addressCol = columns.find((c) =>
    /address|holder|wallet|account|owner|recipient/i.test(c),
  );
  const amountCol = columns.find((c) =>
    /balance|amount|value|qty|quantity|total|weight/i.test(c),
  );

  if (!addressCol || !amountCol || addressCol === amountCol) {
    return {
      error:
        "Could not find address + balance columns in the query result. Expected columns like `address` and `balance`.",
    };
  }
  return { addressCol, amountCol };
}

/**
 * Fetch every row of a Dune query result, following `next_uri` pagination, and
 * normalize to `{ address, amount }`. Rows with an unparseable address are
 * skipped; amounts are passed through as-is (the builder grid validates them).
 */
export async function fetchDuneRows(first: URL): Promise<DuneImportResult> {
  const rows: DuneRow[] = [];
  let total = 0;
  let cols: { addressCol: string; amountCol: string } | null = null;
  let nextUrl: string | null = first.toString();

  for (let page = 0; nextUrl && page < MAX_PAGES; page++) {
    // Re-validate each hop: `next_uri` comes from Dune, but guard the host anyway.
    let hop: URL;
    try {
      hop = new URL(nextUrl);
    } catch {
      throw new Error("Dune returned an invalid pagination URL.");
    }
    if (hop.hostname !== DUNE_HOST) {
      throw new Error("Dune pagination URL had an unexpected host.");
    }

    const res = await fetch(hop, { headers: { accept: "application/json" } });
    if (!res.ok) {
      const detail = res.status === 401 || res.status === 403 ? " (check your api_key)" : "";
      throw new Error(`Dune request failed: ${res.status}${detail}.`);
    }
    const page_: DunePage = await res.json();
    if (page_.error) throw new Error(`Dune: ${page_.error}`);

    const result = page_.result;
    const pageRows = result?.rows ?? [];
    total = result?.metadata?.total_row_count ?? total;

    if (!cols) {
      const picked = pickColumns(result?.metadata?.column_names ?? []);
      if ("error" in picked) throw new Error(picked.error);
      cols = picked;
    }

    for (const r of pageRows) {
      const address = String(r[cols.addressCol] ?? "").trim();
      if (!isAddress(address, { strict: false })) continue; // drop header/junk rows
      rows.push({ address, amount: String(r[cols.amountCol] ?? "").trim() });
      if (rows.length >= MAX_ROWS) {
        return { rows, total: total || rows.length, truncated: true };
      }
    }

    nextUrl = page_.next_uri ?? null;
  }

  return { rows, total: total || rows.length, truncated: false };
}
