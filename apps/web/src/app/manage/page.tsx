"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { airdropTypeLabel } from "@tokamak-network/scatter-drop-sdk";
import {
  AlertCircle,
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  Megaphone,
  Plus,
} from "lucide-react";
import { ConnectGate } from "@/components/ConnectGate";
import { inkBtnClass, POP_CARD, POP_CHIP, whiteBtnClass } from "@/components/pop";
import { EmptyBox } from "@/components/states";
import { useManagedCampaigns } from "@/lib/campaigns";

export default function ManagePage() {
  const { address } = useAccount();
  const { data: campaigns, isPending, isError } = useManagedCampaigns(address);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-chunk uppercase text-2xl md:text-3xl tracking-tight text-ink">
            Operations console
          </h1>
          <p className="text-xs text-ink/60 font-medium mt-1">
            Manage and track the campaigns you created.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/manage/quests"
            className={`text-xs flex items-center gap-1.5 ${whiteBtnClass("lg")}`}
          >
            <ClipboardCheck className="w-4 h-4" /> Quests
          </Link>
          <Link
            href="/manage/announcements/new"
            className={`text-xs flex items-center gap-1.5 ${whiteBtnClass("lg")}`}
          >
            <Megaphone className="w-4 h-4" /> New Announcement
          </Link>
          <Link
            href="/manage/new"
            className={`text-xs flex items-center gap-1.5 ${inkBtnClass("lg")}`}
          >
            <Plus className="w-4 h-4" /> Create New Campaign
          </Link>
        </div>
      </div>

      <ConnectGate prompt="Connect a wallet to manage your campaigns.">
        {isPending ? (
          <EmptyBox icon={<Loader2 className="w-8 h-8 text-ink/40 animate-spin" />}>
            Loading your campaigns…
          </EmptyBox>
        ) : isError ? (
          <EmptyBox icon={<AlertCircle className="w-8 h-8 text-red-500" />}>
            Could not load your campaigns. Is the fork running?
          </EmptyBox>
        ) : !campaigns || campaigns.length === 0 ? (
          <div className={`flex flex-col items-center justify-center p-12 bg-white text-center space-y-4 ${POP_CARD}`}>
            <div className="w-14 h-14 rounded-full bg-pop-yellow border-2 border-ink flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-ink" />
            </div>
            <div className="space-y-1">
              <h3 className="font-chunk uppercase text-sm text-ink">No campaigns yet</h3>
              <p className="text-ink/60 text-xs max-w-sm">
                You haven&apos;t launched any campaigns. Deploy a secure
                identity-gated distribution in seconds.
              </p>
            </div>
            <Link href="/manage/new" className={`text-xs ${inkBtnClass("md")}`}>
              + Deploy Campaign
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/manage/${c.id}`}
                className={`group bg-white p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${POP_CARD}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 shrink-0 rounded-full bg-pop-yellow border-2 border-ink flex items-center justify-center font-bold text-[11px] text-ink">
                    {c.tokenSymbol.slice(0, 4)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-ink">{c.name}</h3>
                      <span className={`${POP_CHIP} uppercase tracking-wide bg-pop-cream text-ink/70 border-ink/25`}>
                        {airdropTypeLabel(c.type)}
                      </span>
                    </div>
                    <p className="text-xs text-ink/60 font-mono">
                      Pool: {c.totalAmount}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 text-xs font-mono">
                  <div className="space-y-0.5">
                    <span className="text-ink/50 block text-[10px]">CLAIMS</span>
                    <span className="text-ink font-bold">{c.claimedPct}%</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-ink/50 block text-[10px]">
                      WINDOW CLOSES
                    </span>
                    <span
                      className={`font-semibold ${c.status === "ended" ? "text-rose-500" : "text-ink"}`}
                    >
                      {c.deadline}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-ink/40 hidden md:block group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </ConnectGate>
    </div>
  );
}
