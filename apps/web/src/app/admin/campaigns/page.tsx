import { airdropTypeLabel } from "@tokamak-network/scatter-drop-sdk";
import { PageHeader, RowLink } from "@/components/ui";
import { listCampaigns } from "@/lib/stub";

export default async function AdminCampaignsPage() {
  const campaigns = await listCampaigns();

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
            detail={`${airdropTypeLabel(c.type)} · ${c.status} · ${c.claimedPct}%`}
          />
        ))}
      </div>
    </>
  );
}
