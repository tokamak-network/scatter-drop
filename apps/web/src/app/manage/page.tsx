"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { airdropTypeLabel } from "@tokamak-network/scatter-drop-sdk";
import { AlertCircle, BarChart3, ChevronRight, Loader2, Megaphone, Plus } from "lucide-react";
import { ConnectGate } from "@/components/ConnectGate";
import { useManagedCampaigns } from "@/lib/campaigns";

export default function ManagePage() {
  const { address } = useAccount();
  const { data: campaigns, isPending, isError } = useManagedCampaigns(address);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Campaign Operations Console
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Manage and track the campaigns you created.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/manage/announcements/new"
            className="bg-slate-900 border border-slate-800 hover:border-sky-500/40 text-slate-200 font-semibold px-4 py-2 rounded-lg text-xs transition flex items-center gap-1.5"
          >
            <Megaphone className="w-4 h-4 text-sky-500" /> New Announcement
          </Link>
          <Link
            href="/manage/new"
            className="bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-4 py-2 rounded-lg text-xs transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Create New Campaign
          </Link>
        </div>
      </div>

      <ConnectGate prompt="Connect a wallet to manage your campaigns.">
        {isPending ? (
          <div className="flex items-center justify-center gap-2 p-12 text-slate-500 text-sm font-mono">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading your campaigns…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <p className="text-slate-400 text-sm max-w-sm">
              Could not load your campaigns. Is the fork running?
            </p>
          </div>
        ) : !campaigns || campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-slate-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-slate-300 font-medium">No campaigns yet</h3>
              <p className="text-slate-500 text-xs max-w-sm">
                You haven&apos;t launched any campaigns. Deploy a secure
                identity-gated distribution in seconds.
              </p>
            </div>
            <Link
              href="/manage/new"
              className="bg-slate-100 hover:bg-white text-slate-950 font-semibold px-4 py-1.5 rounded-lg text-xs transition"
            >
              + Deploy Campaign
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/manage/${c.id}`}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 p-5 rounded-xl transition flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-slate-400 text-xs shrink-0">
                    {c.tokenSymbol.slice(0, 4)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-100">{c.name}</h3>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800/80 text-slate-400">
                        {airdropTypeLabel(c.type)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">
                      Pool: {c.totalAmount}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 text-xs font-mono">
                  <div className="space-y-0.5">
                    <span className="text-slate-500 block text-[10px]">CLAIMS</span>
                    <span className="text-slate-200 font-bold">
                      {c.claimedPct}%
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-500 block text-[10px]">
                      WINDOW CLOSES
                    </span>
                    <span
                      className={`font-semibold ${c.status === "ended" ? "text-rose-400" : "text-slate-300"}`}
                    >
                      {c.deadline}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-600 hidden md:block" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </ConnectGate>
    </div>
  );
}
