import { notFound } from "next/navigation";
import { PageHeader, DescriptionList } from "@/components/ui";
import { getCampaign } from "@/lib/stub";

export default async function AdminCampaignDetailPage({
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
        subtitle="Admin monitoring (operations stay with the operator)."
      />
      <div className="card">
        <DescriptionList
          items={[
            { label: "Operator", value: campaign.operator },
            { label: "Customer CA Registry", value: campaign.identityRegistry },
            { label: "Type", value: campaign.type },
            { label: "Claim rate", value: `${campaign.claimedPct}%` },
            { label: "Total", value: campaign.totalAmount },
            { label: "Deadline", value: campaign.deadline },
          ]}
        />
      </div>
    </>
  );
}
