"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Megaphone, Plus } from "lucide-react";
import { AnnouncementCard } from "@/components/AnnouncementCard";
import { NetworkFilter } from "@/components/NetworkFilter";
import { inkBtnClass, pillClass, usePickedChain } from "@/components/pop";
import { PopHero } from "@/components/PopHero";
import { EmptyBox } from "@/components/states";
import { useAnnouncementsWithStatus, type AnnouncementStatus } from "@/lib/announcements";

type StatusTab = "ALL" | AnnouncementStatus;

const TABS: StatusTab[] = ["ALL", "UPCOMING", "LIVE", "ENDED", "CANCELED"];

/** The "Upcoming Drops" board — operator-posted airdrop pre-announcements. */
export default function UpcomingPage() {
  const [chainId, setPickedChainId] = usePickedChain();
  const { items, isPending, isError } = useAnnouncementsWithStatus(undefined, { chainId });
  const [tab, setTab] = useState<StatusTab>("ALL");

  const filtered = items.filter(({ status }) => tab === "ALL" || status === tab);

  return (
    <div className="space-y-6 animate-fade-in">
      <PopHero
        title="Coming soon"
        subtitle="Airdrops announced by their operators — before they go on-chain."
        action={
          <Link
            href="/manage/announcements/new"
            className={`text-xs flex items-center gap-1.5 ${inkBtnClass("lg")}`}
          >
            <Plus className="w-4 h-4" /> New Announcement
          </Link>
        }
      />

      <NetworkFilter value={chainId} onChange={setPickedChainId} />

      <div className="flex flex-wrap gap-1.5 w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={pillClass(tab === t, "bg-pop-sky")}
          >
            {t === "ALL" ? "All" : t}
          </button>
        ))}
      </div>

      {isPending ? (
        <EmptyBox icon={<Loader2 className="w-8 h-8 text-ink/40 animate-spin" />}>
          Loading announcements…
        </EmptyBox>
      ) : isError ? (
        <EmptyBox icon={<AlertCircle className="w-8 h-8 text-red-500" />}>
          Could not load announcements.
        </EmptyBox>
      ) : filtered.length === 0 ? (
        <EmptyBox icon={<Megaphone className="w-8 h-8 text-ink/40" />}>
          {items.length === 0
            ? "No drops announced yet. Operators can post one from Manage."
            : "No announcements match this filter."}
        </EmptyBox>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(({ a, status }) => (
            <AnnouncementCard key={a.id} a={a} status={status} />
          ))}
        </div>
      )}
    </div>
  );
}
