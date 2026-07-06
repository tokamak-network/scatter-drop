"use client";

import { useRouter } from "next/navigation";
import { RecipientBuilder } from "@/components/RecipientBuilder";
import { PageHeader } from "@/components/ui";
import { DRAFT_CSV_KEY } from "@/lib/draftCsv";

/**
 * Standalone recipient-list builder. The wizard embeds the same
 * RecipientBuilder inline; here it stands on its own and hands the finished
 * list to the campaign wizard via the localStorage draft.
 */
export default function ToolsPage() {
  const router = useRouter();
  const useInCampaign = (csv: string) => {
    try {
      localStorage.setItem(DRAFT_CSV_KEY, csv);
    } catch {
      /* ignore */
    }
    router.push("/manage/new");
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        eyebrow="Tools"
        title="Recipient list builder"
        subtitle="Two steps: aggregate the recipients (from a Dune query or a CSV), then decide how much each one gets."
      />
      <RecipientBuilder onUse={useInCampaign} useLabel="Use in a campaign" />
    </div>
  );
}
