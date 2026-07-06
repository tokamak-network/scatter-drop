"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight, Megaphone, User } from "lucide-react";
import {
  fmtExpectedWindow,
  type Announcement,
  type AnnouncementStatus,
} from "@/lib/announcements";
import { inkBtnClass, POP_CHIP } from "@/components/pop";
import { shortAddr } from "@/lib/explorer";

const STATUS_STYLES: Record<AnnouncementStatus, string> = {
  UPCOMING: "text-ink bg-white/80 border-ink/30",
  LIVE: "text-white bg-ink border-ink",
  ENDED: "text-ink/50 bg-white/60 border-ink/15",
  CANCELED: "text-rose-500 bg-white/80 border-rose-300",
};

export function AnnouncementStatusChip({ status }: { status: AnnouncementStatus }) {
  return (
    <span
      className={`${POP_CHIP} inline-flex items-center gap-1 ${STATUS_STYLES[status]}`}
    >
      {status === "LIVE" && (
        <span className="w-1.5 h-1.5 rounded-full bg-pop-mint animate-pulse" />
      )}
      {status}
    </span>
  );
}

/** Card tone follows lifecycle: sky = announced, mint = claimable now. */
const CARD_TONES: Record<AnnouncementStatus, string> = {
  UPCOMING: "bg-pop-sky",
  LIVE: "bg-pop-mint",
  ENDED: "bg-white",
  CANCELED: "bg-pop-pink/40",
};

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
      className={`group flex flex-col ${CARD_TONES[status]} border-2 border-ink rounded-3xl pop-shadow-sm hover:-translate-y-0.5 transition-transform ${
        compact ? "p-4 min-w-[240px] max-w-[280px] shrink-0" : "p-5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wide text-ink/70">
          <Megaphone className="w-3.5 h-3.5 text-ink" />
          {symbol ?? "DROP"}
        </span>
        <AnnouncementStatusChip status={status} />
      </div>

      <h3
        className={`mt-3 font-bold text-ink leading-tight ${
          compact ? "text-xs truncate" : "text-sm line-clamp-2"
        }`}
      >
        {a.title}
      </h3>

      {!compact && (
        <p className="mt-2 text-xs text-ink/70 leading-relaxed line-clamp-2 min-h-[2rem]">
          {a.body}
        </p>
      )}

      <div
        className={`flex items-center gap-1.5 text-[11px] text-ink/60 font-mono ${
          compact ? "mt-2" : "mt-4"
        }`}
      >
        <CalendarClock className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{fmtExpectedWindow(a)}</span>
      </div>

      {!compact && (
        <div className="mt-4 pt-3 border-t border-ink/15 flex items-center justify-between text-[10px] text-ink/60 font-mono">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" /> {shortAddr(a.operator)}
          </span>
          <span className={`flex items-center gap-0.5 group-hover:translate-x-0.5 ${inkBtnClass("sm")}`}>
            Details <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      )}
    </Link>
  );
}
