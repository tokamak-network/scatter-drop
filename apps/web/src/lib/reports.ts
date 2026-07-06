import type { Address, Hex } from "viem";

/**
 * Tax-document data types + CSV helpers. Receipts and reports are now built
 * from live Claimed events at the call sites (the customer receipt page, the
 * operator distribution report); this module holds the shared shapes and the
 * RFC-4180 / formula-injection-safe CSV serialization. Data is limited to
 * address/amount/time/tx — no identity fields.
 */

export interface ClaimReceipt {
  campaignId: string;
  campaignName: string;
  token: Address;
  amount: string;
  claimedAt: string;
  tx: Hex;
  chain: string;
}


/** Build a CSV string from a header row + data rows (RFC-4180 escaping). */
export function toCsv(headers: string[], rows: string[][]): string {
  // Mitigate CSV formula injection: cells beginning with = + - @ (or a control
  // char) are prefixed with a single quote so spreadsheets do not execute them.
  const sanitize = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  const escape = (v: string) => {
    const s = sanitize(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(escape).join(","));
  return lines.join("\r\n");
}

export function receiptCsv(r: ClaimReceipt): string {
  return toCsv(
    ["field", "value"],
    [
      ["campaign", r.campaignName],
      ["token", r.token],
      ["amount", r.amount],
      ["claimed_at", r.claimedAt],
      ["tx", r.tx],
      ["chain", r.chain],
    ],
  );
}
