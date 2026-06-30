import type { Address, Hex } from "viem";
import { addr, getCampaign } from "./stub";

/**
 * Tax-document data layer (W11) for the W6 scaffold.
 *
 * Stub aggregation of claim events — swapped for real factory/MerkleDrop event
 * indexing in M5+ (same async seam as lib/stub.ts). Personal data is limited to
 * what the customer CA selectively discloses; these stubs expose only
 * address/amount/time/tx (no identity fields).
 */

export interface DistributionRow {
  recipient: Address;
  /** Display amount, e.g. "120 ACME". */
  amount: string;
  /** ISO-8601 claim timestamp. */
  claimedAt: string;
  tx: Hex;
}

export interface ClaimReceipt {
  campaignId: string;
  campaignName: string;
  token: Address;
  amount: string;
  claimedAt: string;
  tx: Hex;
  chain: string;
}

const fakeTx = (seed: string): Hex =>
  `0x${seed.repeat(64).slice(0, 64)}` as Hex;

/**
 * Operator distribution report: one row per claim event (recipient, amount,
 * time, tx). Stub returns a small deterministic sample.
 */
export async function getDistributionReport(
  campaignId: string,
): Promise<DistributionRow[]> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return [];
  const unit = campaign.tokenSymbol;
  return [
    { recipient: addr("a1"), amount: `120 ${unit}`, claimedAt: "2026-06-12T09:14:00Z", tx: fakeTx("1") },
    { recipient: addr("b2"), amount: `80 ${unit}`, claimedAt: "2026-06-12T10:02:00Z", tx: fakeTx("2") },
    { recipient: addr("c3"), amount: `200 ${unit}`, claimedAt: "2026-06-13T18:47:00Z", tx: fakeTx("3") },
    { recipient: addr("d4"), amount: `45 ${unit}`, claimedAt: "2026-06-14T07:21:00Z", tx: fakeTx("4") },
  ];
}

/** Customer claim receipt for a campaign (tax-filing record). */
export async function getClaimReceipt(
  campaignId: string,
  account?: Address,
): Promise<ClaimReceipt | null> {
  if (!account) return null;
  const campaign = await getCampaign(campaignId);
  if (!campaign) return null;
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    token: campaign.token,
    amount: `120 ${campaign.tokenSymbol}`,
    claimedAt: "2026-06-12T09:14:00Z",
    tx: fakeTx("a"),
    chain: "Ethereum Sepolia",
  };
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

export function distributionCsv(rows: DistributionRow[]): string {
  return toCsv(
    ["recipient", "amount", "claimed_at", "tx"],
    rows.map((r) => [r.recipient, r.amount, r.claimedAt, r.tx]),
  );
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
