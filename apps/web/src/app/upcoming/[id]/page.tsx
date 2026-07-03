"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  CalendarClock,
  ExternalLink,
  Loader2,
  RotateCcw,
  User,
} from "lucide-react";
import { AnnouncementStatusChip } from "@/components/AnnouncementCard";
import { ShareCard } from "@/components/ShareCard";
import {
  announcementStatus,
  fmtExpectedWindow,
  patchAnnouncement,
  useAnnouncement,
} from "@/lib/announcements";
import { fmtUnixDateTime, useCampaign } from "@/lib/campaigns";
import { useWalletSession } from "@/lib/useWalletSession";

export default function AnnouncementPage() {
  const { id } = useParams<{ id: string }>();
  const { data: a, isPending, isError } = useAnnouncement(id);
  // Resolve the linked campaign (when the drop exists) for live status + times.
  const { data: campaign } = useCampaign(a?.drop ?? "");

  if (isPending) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-slate-500 text-sm font-mono">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading announcement…
      </div>
    );
  }
  if (isError || !a) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4 text-center">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <p className="text-slate-400 text-sm">Announcement not found.</p>
        <Link href="/upcoming" className="text-sky-500 text-xs font-mono hover:underline">
          ← Back to Upcoming Drops
        </Link>
      </div>
    );
  }

  const status = announcementStatus(a, campaign ?? undefined);

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        href="/upcoming"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-slate-200 transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Upcoming Drops
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <AnnouncementStatusChip status={status} />
              {a.tokenSymbol && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wide bg-slate-950 text-slate-400 border-slate-800">
                  {a.tokenSymbol}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-50 leading-tight">{a.title}</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-slate-400 font-mono">
              <span className="flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" /> Expected: {fmtExpectedWindow(a)}
              </span>
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> {a.operator}
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line border-t border-slate-800/80 pt-4">
              {a.body}
            </p>
            {a.links.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {a.links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" /> {l.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Linked campaign — the announcement fulfilled */}
          {a.drop && (
            <div className="bg-slate-900 border border-emerald-500/20 rounded-xl p-6 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                Campaign is on-chain
              </h3>
              {campaign ? (
                <p className="text-xs text-slate-400 leading-relaxed">
                  Claim window:{" "}
                  {campaign.startTimeUnix === 0n ? "open" : fmtUnixDateTime(campaign.startTimeUnix)} →{" "}
                  {campaign.deadline}
                </p>
              ) : (
                <p className="text-xs text-slate-500 font-mono">
                  Resolving campaign {a.drop.slice(0, 10)}…
                </p>
              )}
              <Link
                href={`/c/${a.drop}`}
                className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-4 py-2 rounded-lg text-xs transition"
              >
                View campaign & claim <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Aside */}
        <div className="space-y-6">
          <ShareCard
            heading="Share this announcement"
            description="Let eligible wallets know a drop is coming."
            shareText={`${a.title} — upcoming airdrop on scatter.drop. ${fmtExpectedWindow(a)}.`}
          />
          <OperatorActions id={a.id} operator={a.operator} canceled={a.canceled} />
        </div>
      </div>
    </div>
  );
}

/**
 * Cancel / reopen, shown only to the posting wallet. Writes require the SIWE
 * session, so the first action may prompt a sign-in signature.
 */
function OperatorActions({
  id,
  operator,
  canceled,
}: {
  id: string;
  operator: string;
  canceled: boolean;
}) {
  const { address } = useAccount();
  const { ensureSession, busy } = useWalletSession(
    "Sign in to scatter.drop to manage your announcements.",
  );
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!address || address.toLowerCase() !== operator) return null;

  const act = async () => {
    setError(null);
    // Establish the operator's session on first use; the server still
    // re-checks, this only saves a guaranteed 401 round-trip.
    if (!(await ensureSession(operator))) return;
    setSaving(true);
    try {
      const res = await patchAnnouncement(id, { canceled: !canceled });
      if (res.error) setError(res.error);
      // The PATCH response is the updated row — cache it instead of refetching.
      else queryClient.setQueryData(["announcement", id], res.announcement);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
        Operator actions
      </h3>
      <button
        type="button"
        onClick={() => void act()}
        disabled={busy || saving}
        className={`w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg border transition disabled:opacity-60 ${
          canceled
            ? "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-200"
            : "bg-rose-500/10 border-rose-500/30 hover:border-rose-500/60 text-rose-400"
        }`}
      >
        {busy || saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : canceled ? (
          <>
            <RotateCcw className="w-4 h-4" /> Reopen announcement
          </>
        ) : (
          <>
            <Ban className="w-4 h-4" /> Cancel announcement
          </>
        )}
      </button>
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
