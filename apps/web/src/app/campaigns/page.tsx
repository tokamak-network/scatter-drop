"use client";

import { useState } from "react";
import Link from "next/link";
import { AirdropType, airdropTypeLabel } from "@tokamak-network/scatter-drop-sdk";
import { AlertCircle, Calendar, ChevronRight, Loader2, Search } from "lucide-react";
import { useCampaigns } from "@/lib/campaigns";
import type { Campaign } from "@/lib/stub";

type TypeTab = "ALL" | AirdropType;
type StatusTab = "ALL" | "ACTIVE" | "ENDED";

const TYPE_TABS: TypeTab[] = [
  "ALL",
  AirdropType.CSV,
  AirdropType.ONCHAIN_SNAPSHOT,
  AirdropType.ONCHAIN_GATED,
  AirdropType.SOCIAL,
];

export default function CampaignsPage() {
  const { data, isPending, isError } = useCampaigns();
  const campaigns = data?.campaigns ?? [];

  const [search, setSearch] = useState("");
  const [typeTab, setTypeTab] = useState<TypeTab>("ALL");
  const [statusTab, setStatusTab] = useState<StatusTab>("ALL");

  const q = search.toLowerCase();
  const filtered = campaigns.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(q) ||
      c.tokenSymbol.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q);
    const matchesType = typeTab === "ALL" || c.type === typeTab;
    const matchesStatus =
      statusTab === "ALL" ||
      (statusTab === "ACTIVE" && c.status === "active") ||
      (statusTab === "ENDED" && c.status === "ended");
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12 shadow-xl">
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Decentralized Sybil-Resistant Distribution
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight text-slate-50">
            Distribute tokens securely with zk-X509 identities.
          </h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            ScatterDrop binds on-chain national-PKI digital signatures to wallet
            claims. Operators deposit funds, define rules, and prevent bot farms.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800/60">
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            aria-label="Search campaigns"
            placeholder="Search campaigns, tokens, descriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 text-slate-100 placeholder-slate-500 pl-10 pr-4 py-2 text-sm rounded-lg outline-none transition"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 w-full lg:w-auto">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setTypeTab(tab)}
              className={`flex-1 lg:flex-none px-3 py-1.5 text-xs font-mono font-medium rounded transition ${
                typeTab === tab
                  ? "bg-slate-800 text-slate-100 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab === "ALL" ? "All Types" : airdropTypeLabel(tab)}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 w-full lg:w-auto">
          {(["ALL", "ACTIVE", "ENDED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusTab(s)}
              className={`flex-1 lg:flex-none px-3 py-1.5 text-xs font-medium rounded border transition ${
                statusTab === s
                  ? "bg-slate-100 text-slate-900 border-slate-200 shadow-sm"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900/50"
              }`}
            >
              {s === "ALL" ? "All Status" : s === "ACTIVE" ? "Active" : "Ended"}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isPending ? (
        <EmptyBox icon={<Loader2 className="w-8 h-8 text-slate-600 animate-spin" />}>
          Loading campaigns…
        </EmptyBox>
      ) : isError ? (
        <EmptyBox icon={<AlertCircle className="w-8 h-8 text-red-500" />}>
          Could not load campaigns. Is the fork running?
        </EmptyBox>
      ) : campaigns.length === 0 ? (
        <EmptyBox icon={<AlertCircle className="w-8 h-8 text-slate-600" />}>
          No campaigns on-chain yet. Be the first to launch one.
        </EmptyBox>
      ) : filtered.length === 0 ? (
        <EmptyBox icon={<Search className="w-8 h-8 text-slate-600" />}>
          No campaigns match your search or filters.
        </EmptyBox>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((c) => (
            <CampaignCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignCard({ c }: { c: Campaign }) {
  const ended = c.status === "ended";
  return (
    <Link
      href={`/c/${c.id}`}
      className="group relative flex flex-col justify-between bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 shadow-sm hover:shadow-md transition"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border uppercase bg-indigo-950/40 text-indigo-400 border-indigo-900/40">
            {airdropTypeLabel(c.type)}
          </span>
          {ended ? (
            <span className="text-[10px] text-slate-500 font-mono bg-slate-950 px-2 py-0.5 rounded">
              ENDED
            </span>
          ) : (
            <span className="text-[10px] text-emerald-600 font-mono bg-emerald-950/20 px-2 py-0.5 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ACTIVE
            </span>
          )}
        </div>

        <div className="flex gap-3">
          <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-slate-500 text-xs">
            {c.tokenSymbol.slice(0, 4)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-100 group-hover:text-emerald-600 leading-tight transition truncate">
              {c.name}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
              Pool: {c.totalAmount}
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
          {c.description}
        </p>

        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
          <div className="text-[10px] font-mono text-slate-400">
            zk-X509 CA Gate
          </div>
          <div className="text-[11px] font-semibold text-slate-300 truncate">
            {c.identityRegistryLabel}
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3 text-slate-500" />
          {c.deadline === "No deadline" ? "No deadline" : `Ends ${c.deadline}`}
        </span>
        <span className="flex items-center text-emerald-600 group-hover:translate-x-1 transition-transform">
          Check Eligibility <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
        </span>
      </div>
    </Link>
  );
}

function EmptyBox({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-12 bg-slate-950 border border-slate-800 rounded-xl text-center space-y-3">
      {icon}
      <p className="text-slate-400 text-sm max-w-sm">{children}</p>
    </div>
  );
}
