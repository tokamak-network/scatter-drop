"use client";

import { use } from "react";
import { airdropTypeLabel } from "@tokamak-network/scatter-drop-sdk";
import { PageHeader, Badge, DescriptionList } from "@/components/ui";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { useCampaign } from "@/lib/campaigns";
import { ClaimPanel } from "./ClaimPanel";

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: campaign, isPending, isError } = useCampaign(id);

  if (isPending) return <Loading label="Loading campaign…" />;
  if (isError) {
    return (
      <ErrorState>Could not load campaign. Is the fork running?</ErrorState>
    );
  }
  if (!campaign) {
    return (
      <EmptyState
        title="Campaign not found"
        description="This campaign is not on-chain on the connected network."
        action={{ href: "/campaigns", label: "Explore campaigns" }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={campaign.name}
        subtitle={campaign.description}
        action={<Badge>{airdropTypeLabel(campaign.type)}</Badge>}
      />

      <div className="grid grid-cols-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Campaign info</h3>
          <DescriptionList
            items={[
              { label: "Total", value: campaign.totalAmount },
              { label: "Deadline", value: campaign.deadline },
              { label: "Token", value: campaign.token },
              { label: "Operator", value: campaign.operator },
              {
                label: "CA Registry",
                value: `${campaign.identityRegistryLabel} (${campaign.identityRegistry})`,
              },
            ]}
          />
        </div>

        <ClaimPanel campaign={campaign} />
      </div>
    </>
  );
}
