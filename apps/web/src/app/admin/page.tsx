import { PageHeader, Kpi } from "@/components/ui";
import { getAdminOverview } from "@/lib/stub";

export default async function AdminOverviewPage() {
  const o = await getAdminOverview();

  return (
    <>
      <PageHeader title="Platform Overview" />
      <div className="grid grid-cols-3">
        <Kpi label="Total campaigns" value={String(o.totalCampaigns)} />
        <Kpi label="Active" value={String(o.activeCampaigns)} />
        <Kpi label="Ended" value={String(o.endedCampaigns)} />
        <Kpi label="Collected fees" value={o.collectedFees} />
        <Kpi label="Operators" value={String(o.operatorCount)} />
      </div>
    </>
  );
}
