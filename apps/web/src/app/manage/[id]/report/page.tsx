import { notFound } from "next/navigation";
import Link from "next/link";
import { getCampaign } from "@/lib/stub";
import { distributionCsv, getDistributionReport } from "@/lib/reports";
import { ReportActions } from "@/components/ReportActions";

export default async function DistributionReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const rows = await getDistributionReport(id);
  const csv = distributionCsv(rows);

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
          {rows.map((r) => (
            <tr key={r.tx}>
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
        Personal data is limited to the customer CA&apos;s selective disclosure.
        Stub data — live claim-event aggregation lands in M5.
      </p>
    </div>
  );
}
