"use client";

import { use } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { Loader2 } from "lucide-react";
import { ReportActions } from "@/components/ReportActions";
import { fmtUnixDateTime, useCampaign, useClaimEvents } from "@/lib/campaigns";
import { toCsv } from "@/lib/reports";
import { useRecipients } from "@/lib/proofs";

// The recipient list is public by design (the campaign page's Recipients
// directory — anyone must be able to look up their proof to claim), and
// Claimed events are public on-chain, so this report needs no auth gate; it's
// a formatted join of two already-public sources. Personal data is limited to
// address/amount/time/tx — no identity fields.
export default function DistributionReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: campaign, isPending } = useCampaign(id);
  // isLoading, not isPending: both queries are disabled until the campaign
  // resolves, and a disabled query stays isPending forever — the not-found
  // branch below would be unreachable.
  const { data: recipients, isLoading: recipientsLoading } = useRecipients(campaign ?? undefined);
  const { data: claims, isLoading: claimsLoading } = useClaimEvents(campaign ?? undefined);

  if (isPending || recipientsLoading || claimsLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!campaign) {
    return (
      <div className="print-doc">
        <p className="muted">Campaign not found on the connected network.</p>
        <Link href="/manage" className="muted">
          ← Back to console
        </Link>
      </div>
    );
  }

  const decimals = campaign.decimals ?? 18;
  const fmt = (raw: bigint) =>
    `${formatUnits(raw, decimals)} ${campaign.tokenSymbol}`;
  const claimByAccount = new Map((claims ?? []).map((c) => [c.account, c]));

  // One row per recipient (claimed or not); campaigns without a published
  // list (recipients === null) still render from the events alone.
  const rows = recipients
    ? recipients.map((r) => {
        const claim = claimByAccount.get(r.address);
        return {
          recipient: r.address,
          amount: fmt(r.amount),
          // timestamp 0 = claim exists but block time wasn't resolved (too
          // many blocks) — the column stays date-or-dash and the tx column
          // still records the claim.
          claimedAt: claim?.timestamp ? fmtUnixDateTime(claim.timestamp) : "—",
          tx: claim?.txHash ?? "—",
        };
      })
    : (claims ?? []).map((c) => ({
        recipient: c.account,
        amount: fmt(c.amount),
        claimedAt: c.timestamp ? fmtUnixDateTime(c.timestamp) : "—",
        tx: c.txHash,
      }));

  const csv = toCsv(
    ["recipient", "amount", "claimed_at", "tx"],
    rows.map((r) => [r.recipient, r.amount, r.claimedAt, r.tx]),
  );

  return (
    <div className="print-doc">
      <div className="no-print" style={{ marginBottom: 16 }}>
        <Link href={`/manage/${id}`} className="muted">
          ← Back to campaign
        </Link>
      </div>

      <h1 style={{ margin: "0 0 4px" }}>Distribution report</h1>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        {campaign.name} · token {campaign.token}
      </p>

      <ReportActions csv={csv} filename={`distribution-${id}.csv`} />

      {recipients === null && (
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          The recipient list isn&apos;t published — showing on-chain claims only.
        </p>
      )}

      <table className="report" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Recipient</th>
            <th>Amount</th>
            <th>Claimed at</th>
            <th>Tx</th>
          </tr>
        </thead>
        <tbody>
          {/* recipient alone can repeat in the claims-only fallback (one
              address can hold multiple leaf indices) — include the tx. */}
          {rows.map((r) => (
            <tr key={`${r.recipient}-${r.tx}`}>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" }}>
                {r.recipient}
              </td>
              <td>{r.amount}</td>
              <td>{r.claimedAt}</td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" }}>
                {r.tx}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        Personal data is limited to the customer CA&apos;s selective disclosure —
        this report contains only address, amount, time, and transaction hash.
      </p>
    </div>
  );
}
