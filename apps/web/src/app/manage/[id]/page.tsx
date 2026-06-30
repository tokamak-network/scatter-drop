import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Kpi, StubButton } from "@/components/ui";
import { getCampaign, getParticipantStats } from "@/lib/stub";

export default async function ManageCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const stats = await getParticipantStats(id);

  return (
    <>
      <PageHeader title={campaign.name} subtitle="Campaign management" />

      <section style={{ marginBottom: 24 }}>
        <h3>Overview</h3>
        <div className="grid grid-cols-3">
          <Kpi label="Claim rate" value={`${campaign.claimedPct}%`} />
          <Kpi label="Total" value={campaign.totalAmount} />
          <Kpi label="Deadline" value={campaign.deadline} />
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3>Participants</h3>
        <div className="grid grid-cols-3">
          <Kpi label="Eligible" value={stats.eligible.toLocaleString()} />
          <Kpi label="Verified" value={stats.verified.toLocaleString()} />
          <Kpi label="Claimed" value={stats.claimed.toLocaleString()} />
          <Kpi label="Unclaimed" value={stats.unclaimed.toLocaleString()} />
          <Kpi label="Claim rate" value={`${stats.claimRatePct}%`} />
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Time-series chart, distribution and CSV export wired up in M6.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3>Tax documents</h3>
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            Distribution report (recipient · amount · time · tx) for accounting
            and tax filing.
          </p>
          <Link className="btn" href={`/manage/${id}/report`}>
            Distribution report →
          </Link>
        </div>
      </section>

      <section>
        <h3>Sweep</h3>
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            Recover unclaimed tokens after the deadline (operator only).
          </p>
          <StubButton milestone="M6">Sweep remaining</StubButton>
        </div>
      </section>
    </>
  );
}
