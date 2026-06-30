"use client";

import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, RowLink } from "@/components/ui";
import { EmptyState, Loading, ErrorState } from "@/components/states";
import { ConnectGate } from "@/components/ConnectGate";
import { listMyClaims } from "@/lib/stub";

export default function MyClaimsPage() {
  const { address } = useAccount();
  const {
    data: claims,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["myClaims", address],
    queryFn: () => listMyClaims(address),
    enabled: !!address,
  });

  return (
    <>
      <PageHeader
        title="My Claims"
        subtitle="Your pre-confirmed (Merkle) allocations. A shortcut — not required to claim."
      />

      <ConnectGate prompt="Connect a wallet to see your allocations.">
        {isLoading ? (
          <Loading label="Loading your claims…" />
        ) : isError ? (
          <ErrorState>Could not load your claims. Please try again.</ErrorState>
        ) : !claims || claims.length === 0 ? (
          <EmptyState
            title="Nothing to claim yet"
            description="Browse open campaigns — you may qualify on the spot."
            action={{ href: "/campaigns", label: "Explore campaigns" }}
          />
        ) : (
          <div className="grid">
            {claims.map((claim) => (
              <RowLink
                key={claim.campaignId}
                href={`/c/${claim.campaignId}`}
                label={claim.campaignName}
                detail={`${claim.amount} · ${claim.claimed ? "claimed" : "available"}`}
              />
            ))}
          </div>
        )}
      </ConnectGate>
    </>
  );
}
