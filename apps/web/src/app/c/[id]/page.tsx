"use client";

import { use } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { airdropTypeLabel, isVerificationValid } from "@tokamak-network/scatter-drop-sdk";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { IdentityGate } from "@/components/IdentityGate";
import { useVerifiedUntil } from "@/lib/contracts";
import { useCampaign } from "@/lib/campaigns";
import { ClaimPanel } from "./ClaimPanel";

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: campaign, isPending, isError } = useCampaign(id);
  const { address } = useAccount();
  const { data: verifiedUntil } = useVerifiedUntil(
    campaign?.identityRegistry,
    address,
  );

  if (isPending) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (isError || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-slate-600" />
        <p className="text-slate-400 text-sm">
          {isError
            ? "Could not load campaign. Is the fork running?"
            : "This campaign is not on-chain on the connected network."}
        </p>
        <Link href="/campaigns" className="text-emerald-600 text-sm hover:underline">
          ← Explore campaigns
        </Link>
      </div>
    );
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const gateState = !address
    ? "unverified"
    : verifiedUntil === undefined
      ? "loading"
      : isVerificationValid(verifiedUntil, now)
        ? "verified"
        : "unverified";

  return (
    <div className="space-y-8 animate-fade-in">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-100 transition text-sm font-mono"
      >
        <ArrowLeft className="w-4 h-4" />
        BACK TO DIRECTORY
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: campaign info + identity gate */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row gap-5 items-start">
              <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-lg text-slate-500 shrink-0">
                {campaign.tokenSymbol.slice(0, 4)}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase bg-indigo-950/40 text-indigo-400 border-indigo-900/40">
                    {airdropTypeLabel(campaign.type)}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${
                      campaign.status === "active"
                        ? "bg-emerald-950/40 text-emerald-600 border-emerald-900/40"
                        : "bg-slate-800 text-slate-500 border-slate-700/50"
                    }`}
                  >
                    {campaign.status}
                  </span>
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-slate-100">
                  {campaign.name}
                </h1>
                <p className="text-xs text-slate-500 font-mono">
                  Operator:{" "}
                  <span className="text-slate-300">
                    {campaign.operator.slice(0, 10)}…{campaign.operator.slice(-8)}
                  </span>
                </p>
              </div>
            </div>

            <p className="text-slate-300 text-sm leading-relaxed border-t border-slate-800/80 pt-4">
              {campaign.description}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-lg border border-slate-800/60 text-xs font-mono">
              <div className="space-y-1 min-w-0">
                <span className="text-slate-500">Airdrop Token</span>
                <div className="text-slate-300 truncate font-semibold select-all">
                  {campaign.token}
                </div>
              </div>
              <div className="space-y-1 min-w-0">
                <span className="text-slate-500">Drop Contract</span>
                <div className="text-slate-300 truncate font-semibold select-all">
                  {campaign.drop}
                </div>
              </div>
            </div>
          </div>

          <IdentityGate state={gateState} registryLabel={campaign.identityRegistryLabel} />
        </div>

        {/* Right: claims portal */}
        <ClaimPanel campaign={campaign} />
      </div>
    </div>
  );
}
