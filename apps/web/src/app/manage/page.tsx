"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, RowLink } from "@/components/ui";
import { EmptyState, Loading, ErrorState } from "@/components/states";
import { ConnectGate } from "@/components/ConnectGate";
import { listManagedCampaigns } from "@/lib/stub";

export default function ManagePage() {
  const { address } = useAccount();
  const {
    data: campaigns,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["managedCampaigns", address],
    queryFn: () => listManagedCampaigns(address),
    enabled: !!address,
  });

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
        {isLoading ? (
          <Loading label="Loading your campaigns…" />
        ) : isError ? (
          <ErrorState>Could not load your campaigns. Please try again.</ErrorState>
        ) : !campaigns || campaigns.length === 0 ? (
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
