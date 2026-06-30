import { notFound } from "next/navigation";
import { airdropTypeLabel } from "@tokamak-network/scatter-drop-sdk";
import { PageHeader, Badge, DescriptionList } from "@/components/ui";
import { getCampaign } from "@/lib/stub";
import { ClaimPanel } from "./ClaimPanel";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

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
              { label: "Claimed", value: `${campaign.claimedPct}%` },
              { label: "Deadline", value: campaign.deadline },
              { label: "Token", value: campaign.token },
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
