"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Gift } from "lucide-react";
import { EmptyState, Loading, ErrorState } from "@/components/states";
import { ConnectGate } from "@/components/ConnectGate";
import { inkBtnClass, POP_CHIP, POP_PANEL } from "@/components/pop";
import { LiveChip } from "@/components/popUi";
import { PageHeader } from "@/components/ui";
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
    <div className="space-y-6 animate-fade-in">
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
          <div className="space-y-4">
            {claims.map((claim) => (
              <div
                key={claim.campaignId}
                className={`flex flex-wrap items-center justify-between gap-3 p-5 ${
                  claim.claimed ? "bg-white" : "bg-pop-mint"
                } ${POP_PANEL}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-ink flex items-center justify-center">
                    <Gift className="w-4 h-4 text-ink" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-ink truncate">
                      {claim.campaignName}
                    </h3>
                    <p className="text-[11px] font-mono text-ink/60 mt-0.5">
                      {claim.amount}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {claim.claimed ? (
                    <span className={`${POP_CHIP} text-ink/60 bg-white/70 border-ink/20 flex items-center gap-1`}>
                      <Check className="w-3 h-3" /> CLAIMED
                    </span>
                  ) : (
                    <LiveChip>Available</LiveChip>
                  )}
                  {claim.claimed && (
                    <Link
                      href={`/c/${claim.campaignId}/receipt`}
                      className="text-[11px] font-bold text-ink underline underline-offset-2 hover:text-ink/70"
                    >
                      Receipt →
                    </Link>
                  )}
                  <Link
                    href={`/c/${claim.campaignId}`}
                    className={`flex items-center gap-0.5 text-xs hover:translate-x-0.5 ${inkBtnClass("sm")}`}
                  >
                    {claim.claimed ? "View" : "Claim"} <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </ConnectGate>
    </div>
  );
}
