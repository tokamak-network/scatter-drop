"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui";
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
              <div key={claim.campaignId} className="card row">
                <Link href={`/c/${claim.campaignId}`}>
                  {claim.campaignName}
                </Link>
                <span className="row" style={{ gap: 16 }}>
                  <span className="muted">
                    {claim.amount} · {claim.claimed ? "claimed" : "available"}
                  </span>
                  <Link
                    href={`/c/${claim.campaignId}/receipt`}
                    className="muted"
                    style={{ fontSize: 13, textDecoration: "underline" }}
                  >
                    Receipt →
                  </Link>
                </span>
              </div>
            ))}
          </div>
        )}
      </ConnectGate>
    </>
  );
}
