"use client";

import { useAccount } from "wagmi";
import { PageHeader, RowLink } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { ConnectGate } from "@/components/ConnectGate";
import { listMyClaims } from "@/lib/stub";

export default function MyClaimsPage() {
  const { address } = useAccount();
  const claims = listMyClaims(address);

  return (
    <>
      <PageHeader
        title="My Claims"
        subtitle="Your pre-confirmed (Merkle) allocations. A shortcut — not required to claim."
      />

      <ConnectGate prompt="Connect a wallet to see your allocations.">
        {claims.length === 0 ? (
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
