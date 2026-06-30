"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { PageHeader, RowLink } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { ConnectGate } from "@/components/ConnectGate";
import { listManagedCampaigns } from "@/lib/stub";

export default function ManagePage() {
  const { address } = useAccount();
  const campaigns = listManagedCampaigns(address);

  return (
    <>
      <PageHeader
        title="Manage"
        subtitle="Campaigns you created."
        action={
          <Link className="btn btn-primary" href="/manage/new">
            + New Campaign
          </Link>
        }
      />

      <ConnectGate prompt="Connect a wallet to see your campaigns.">
        {campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create your first compliant airdrop."
            action={{ href: "/manage/new", label: "+ Create a campaign" }}
          />
        ) : (
          <div className="grid">
            {campaigns.map((c) => (
              <RowLink
                key={c.id}
                href={`/manage/${c.id}`}
                label={c.name}
                detail={`${c.status} · ${c.claimedPct}% claimed`}
              />
            ))}
          </div>
        )}
      </ConnectGate>
    </>
  );
}
