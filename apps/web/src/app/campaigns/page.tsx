import { PageHeader, CampaignCard } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { listCampaigns } from "@/lib/stub";

export default async function CampaignsPage() {
  const campaigns = await listCampaigns();

  return (
    <>
      <PageHeader
        title="Explore"
        subtitle="All active campaigns. No wallet required."
      />
      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Be the first to launch a compliant airdrop."
          action={{ href: "/manage/new", label: "+ Create a campaign" }}
        />
      ) : (
        <div className="grid grid-cols-2">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </>
  );
}
