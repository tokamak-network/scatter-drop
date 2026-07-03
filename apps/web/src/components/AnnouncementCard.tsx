"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight, Megaphone, User } from "lucide-react";
import {
  fmtExpectedWindow,
  type Announcement,
  type AnnouncementStatus,
} from "@/lib/announcements";
import { shortAddr } from "@/lib/explorer";

const STATUS_STYLES: Record<AnnouncementStatus, string> = {
  UPCOMING: "text-sky-500 bg-sky-500/10 border-sky-500/20",
  LIVE: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  ENDED: "text-slate-400 bg-slate-950 border-slate-800",
  CANCELED: "text-rose-400 bg-rose-500/10 border-rose-500/20",
};

export function AnnouncementStatusChip({ status }: { status: AnnouncementStatus }) {
  return (
    <span
      className={`text-[10px] font-mono px-2 py-0.5 rounded border inline-flex items-center gap-1 ${STATUS_STYLES[status]}`}
    >
      {status === "LIVE" && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      )}
      {status}
    </span>
  );
}

/**
 * One announcement on the Upcoming board. `compact` renders the smaller strip
 * variant used on Explore (no body excerpt / operator row).
 */
export function AnnouncementCard({
  a,
  status,
  compact = false,
}: {
  a: Announcement;
  status: AnnouncementStatus;
  compact?: boolean;
}) {
  const symbol =
    a.tokenSymbol?.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || null;

  return (
    <Link
      href={`/upcoming/${a.id}`}
      className={`group flex flex-col bg-slate-900 border border-slate-800 hover:border-sky-500/40 rounded-xl shadow-sm hover:shadow-md transition ${
        compact ? "p-4 min-w-[240px] max-w-[280px] shrink-0" : "p-5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide text-slate-400">
          <Megaphone className="w-3.5 h-3.5 text-sky-500" />
          {symbol ?? "DROP"}
        </span>
        <AnnouncementStatusChip status={status} />
      </div>

      <h3
        className={`mt-3 font-semibold text-slate-50 group-hover:text-sky-400 leading-tight transition ${
          compact ? "text-xs truncate" : "text-sm line-clamp-2"
        }`}
      >
        {a.title}
      </h3>

      {!compact && (
        <p className="mt-2 text-xs text-slate-400 leading-relaxed line-clamp-2 min-h-[2rem]">
          {a.body}
        </p>
      )}

      <div
        className={`flex items-center gap-1.5 text-[11px] text-slate-400 font-mono ${
          compact ? "mt-2" : "mt-4"
        }`}
      >
        <CalendarClock className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{fmtExpectedWindow(a)}</span>
      </div>

      {!compact && (
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" /> {shortAddr(a.operator)}
          </span>
          <span className="flex items-center font-semibold text-sky-500 group-hover:translate-x-0.5 transition-transform">
            Details <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </span>
        </div>
      )}
    </Link>
  );
}
