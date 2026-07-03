"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Megaphone, Plus } from "lucide-react";
import { AnnouncementCard } from "@/components/AnnouncementCard";
import { EmptyBox } from "@/components/states";
import { useAnnouncementsWithStatus, type AnnouncementStatus } from "@/lib/announcements";

type StatusTab = "ALL" | AnnouncementStatus;

const TABS: StatusTab[] = ["ALL", "UPCOMING", "LIVE", "ENDED", "CANCELED"];

/** The "Upcoming Drops" board — operator-posted airdrop pre-announcements. */
export default function UpcomingPage() {
  const { items, isPending, isError } = useAnnouncementsWithStatus();
  const [tab, setTab] = useState<StatusTab>("ALL");

  const filtered = items.filter(({ status }) => tab === "ALL" || status === tab);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Upcoming Drops
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Airdrops announced by their operators — before they go on-chain.
          </p>
        </div>
        <Link
          href="/manage/announcements/new"
          className="bg-sky-500 hover:bg-sky-400 text-white font-semibold px-4 py-2 rounded-lg text-xs transition flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> New Announcement
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded transition ${
              tab === t
                ? "bg-slate-800 text-slate-100 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t === "ALL" ? "All" : t}
          </button>
        ))}
      </div>

      {isPending ? (
        <EmptyBox icon={<Loader2 className="w-8 h-8 text-slate-600 animate-spin" />}>
          Loading announcements…
        </EmptyBox>
      ) : isError ? (
        <EmptyBox icon={<AlertCircle className="w-8 h-8 text-red-500" />}>
          Could not load announcements.
        </EmptyBox>
      ) : filtered.length === 0 ? (
        <EmptyBox icon={<Megaphone className="w-8 h-8 text-slate-600" />}>
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
