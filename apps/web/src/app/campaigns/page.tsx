"use client";

import { useState } from "react";
import Link from "next/link";
import { zeroAddress } from "viem";
import { AirdropType, airdropTypeLabel } from "@tokamak-network/scatter-drop-sdk";
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  Globe,
  Loader2,
  Search,
  ShieldCheck,
  User,
} from "lucide-react";
import { AnnouncementCard } from "@/components/AnnouncementCard";
import { NetworkFilter } from "@/components/NetworkFilter";
import { inkBtnClass, pillClass, POP_CARD, POP_CHIP, POP_PANEL, usePickedChain } from "@/components/pop";
import { PopHero } from "@/components/PopHero";
import { EmptyBox } from "@/components/states";
import { useAnnouncementsWithStatus } from "@/lib/announcements";
import { useCampaigns } from "@/lib/campaigns";
import { shortAddr } from "@/lib/explorer";
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
  const [chainId, setPickedChainId] = usePickedChain();
  const { data, isPending, isError } = useCampaigns({ chainId });
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
      <PopHero
        title="What's dropping?"
        subtitle="Live airdrops and announced drops — check your eligibility and claim your share."
      />

      <UpcomingStrip chainId={chainId} />

      <NetworkFilter value={chainId} onChange={setPickedChainId} />

      {/* Filters */}
      <div className={`flex flex-col lg:flex-row gap-4 justify-between items-center bg-white p-4 ${POP_PANEL}`}>
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40" />
          <input
            type="text"
            aria-label="Search campaigns"
            placeholder="Search campaigns, tokens, descriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-pop-cream border-2 border-ink/15 focus:border-ink text-ink placeholder-ink/40 pl-10 pr-4 py-2 text-sm rounded-full outline-none transition"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 w-full lg:w-auto">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={typeTab === tab}
              onClick={() => setTypeTab(tab)}
              className={pillClass(typeTab === tab, "bg-pop-yellow", "flex-1 lg:flex-none")}
            >
              {tab === "ALL" ? "All Types" : airdropTypeLabel(tab)}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 w-full lg:w-auto">
          {(["ALL", "ACTIVE", "ENDED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={statusTab === s}
              onClick={() => setStatusTab(s)}
              className={pillClass(statusTab === s, "bg-pop-mint", "flex-1 lg:flex-none")}
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
          {filtered.map((c, i) => (
            <CampaignCard key={c.id} c={c} tone={POP_TONES[i % POP_TONES.length]!} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Announced-but-not-yet-live drops, teased above Explore. Renders nothing when
 * there's nothing upcoming, so the board stays invisible until operators use it.
 */
function UpcomingStrip({ chainId }: { chainId: number }) {
  const { items } = useAnnouncementsWithStatus(undefined, { chainId });
  const upcoming = items.filter(({ status }) => status === "UPCOMING");
  if (upcoming.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-chunk uppercase text-sm tracking-wide text-ink">
          Upcoming drops
        </h2>
        <Link
          href="/upcoming"
          className="text-[11px] font-bold text-ink bg-white border-2 border-ink/20 hover:border-ink rounded-full px-3 py-1 transition flex items-center"
        >
          View all <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {upcoming.slice(0, 6).map(({ a, status }) => (
          <AnnouncementCard key={a.id} a={a} status={status} compact />
        ))}
      </div>
    </section>
  );
}

/** Pastel card backgrounds rotated by grid position (playful pilot). */
const POP_TONES = ["bg-pop-mint", "bg-pop-sky", "bg-pop-yellow", "bg-pop-purple"] as const;

function CampaignCard({ c, tone }: { c: Campaign; tone: (typeof POP_TONES)[number] }) {
  const ended = c.status === "ended";
  // Address-based, like the detail page — the human label isn't load-bearing.
  const open = c.identityRegistry === zeroAddress;
  const avatar = c.tokenSymbol.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "TKN";

  return (
    <Link
      href={`/c/${c.id}`}
      className={`group relative flex flex-col ${tone} p-5 ${POP_CARD}`}
    >
      {/* Type + status */}
      <div className="flex items-center justify-between">
        <span className={`${POP_CHIP} border-ink/25 uppercase tracking-wide bg-white/80 text-ink`}>
          {airdropTypeLabel(c.type)}
        </span>
        {ended ? (
          <span className={`${POP_CHIP} text-ink/60 bg-white/60 border-ink/20`}>
            ENDED
          </span>
        ) : (
          <span className={`${POP_CHIP} text-white bg-ink border-ink flex items-center gap-1`}>
            <span className="w-1.5 h-1.5 rounded-full bg-pop-mint animate-pulse" />
            ACTIVE
          </span>
        )}
      </div>

      {/* Token identity */}
      <div className="mt-4 flex items-center gap-3">
        <div className="w-11 h-11 shrink-0 rounded-full bg-white border-2 border-ink flex items-center justify-center font-bold text-[11px] text-ink">
          {avatar}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-ink leading-tight truncate">
            {c.name}
          </h3>
          <p className="text-[11px] text-ink/60 font-mono mt-0.5 truncate">
            {shortAddr(c.drop)}
          </p>
        </div>
      </div>

      {/* Tagline — what this drop is / why to click in */}
      <p className="mt-3 text-xs text-ink/70 leading-relaxed line-clamp-2 min-h-[2rem]">
        {c.description}
      </p>

      {/* Hero stat: pool */}
      <div className="mt-4 rounded-2xl bg-white/70 border border-ink/15 px-3.5 py-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-ink/50">
          Pool
        </div>
        <div className="text-lg font-bold text-ink truncate">
          {c.totalAmount}
        </div>
      </div>

      {/* Meta */}
      <dl className="mt-4 space-y-2 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-ink/60">
            <User className="w-3.5 h-3.5" /> Operator
          </dt>
          <dd className="font-mono text-ink">{shortAddr(c.operator)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-ink/60">
            {open ? (
              <Globe className="w-3.5 h-3.5" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-ink" />
            )}
            Access
          </dt>
          <dd className="text-ink truncate max-w-[60%] text-right">
            {open ? "No identity gate" : c.identityRegistryLabel}
          </dd>
        </div>
      </dl>

      {/* Footer */}
      <div className="mt-5 pt-4 border-t border-ink/15 flex items-center justify-between text-[10px] text-ink/60 font-mono">
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {c.deadline === "No deadline" ? "No deadline" : `Ends ${c.deadline}`}
        </span>
        <span className={`flex items-center gap-0.5 group-hover:translate-x-0.5 ${inkBtnClass("md")}`}>
          Check eligibility <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}

