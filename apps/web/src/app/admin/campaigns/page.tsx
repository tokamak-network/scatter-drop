import { PageHeader, RowLink } from "@/components/ui";
import { listCampaigns } from "@/lib/stub";

export default function AdminCampaignsPage() {
  const campaigns = listCampaigns();

  return (
    <>
      <PageHeader
        title="Campaigns (All)"
        subtitle={`${campaigns.length} registered campaigns — monitoring only.`}
      />
      <div className="grid">
        {campaigns.map((c) => (
          <RowLink
            key={c.id}
            href={`/admin/campaigns/${c.id}`}
            label={c.name}
            detail={`${c.type} · ${c.status} · ${c.claimedPct}%`}
          />
        ))}
      </div>
    </>
  );
}
