"use client";

import { PageHeader, CampaignCard } from "@/components/ui";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { useCampaigns } from "@/lib/campaigns";

export default function CampaignsPage() {
  const { data, isPending, isError } = useCampaigns();
  const campaigns = data?.campaigns ?? [];

  return (
    <>
      <PageHeader
        title="Explore"
        subtitle={
          data?.live
            ? "All on-chain campaigns. No wallet required."
            : "All active campaigns. No wallet required."
        }
      />
      {isPending ? (
        <Loading label="Loading campaigns…" />
      ) : isError ? (
        <ErrorState>Could not load campaigns. Is the fork running?</ErrorState>
      ) : campaigns.length === 0 ? (
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
