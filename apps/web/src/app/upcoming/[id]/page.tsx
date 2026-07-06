"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useChainId, useChains, useSwitchChain } from "wagmi";
import type { Chain } from "viem";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  CalendarClock,
  CalendarPlus,
  ExternalLink,
  Globe,
  Loader2,
  RotateCcw,
  User,
} from "lucide-react";
import { AnnouncementStatusChip } from "@/components/AnnouncementCard";
import { Markdown } from "@/components/Markdown";
import {
  inkBtnClass,
  whiteBtnClass,
  POP_CHIP,
  POP_PANEL,
  POP_HEADING,
} from "@/components/pop";
import { ShareCard } from "@/components/ShareCard";
import {
  announcementStatus,
  fmtExpectedWindow,
  patchAnnouncement,
  useAnnouncement,
  type Announcement,
} from "@/lib/announcements";
import { buildIcs, googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar";
import { fmtUnixDateTime, useCampaign } from "@/lib/campaigns";
import { downloadFile } from "@/lib/download";
import { chainLabel, explorerUrl, shortAddr } from "@/lib/explorer";
import { mdFirstParagraph } from "@/lib/markdown";
import { useWalletSession } from "@/lib/useWalletSession";

export default function AnnouncementPage() {
  const { id } = useParams<{ id: string }>();
  const { data: a, isPending, isError } = useAnnouncement(id);
  // The linked campaign is read on the ANNOUNCEMENT's chain, not the wallet's
  // — a shared link opened from any network still shows the true live status.
  // The wallet chain only decides whether the claim CTA needs a switch prompt.
  const chainId = useChainId();
  const chains = useChains();
  const announcementChain = a ? chains.find((c) => c.id === a.chainId) : undefined;
  const wrongChain = !!a && a.chainId !== chainId;
  const { data: campaign } = useCampaign(a?.drop ?? "", { chainId: a?.chainId });

  if (isPending) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-ink/50 text-sm font-mono">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading announcement…
      </div>
    );
  }
  if (isError || !a) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4 text-center">
        <AlertCircle className="w-8 h-8 text-rose-500" />
        <p className="text-ink/60 text-sm">Announcement not found.</p>
        <Link href="/upcoming" className={`text-xs ${inkBtnClass("md")}`}>
          ← Back to Announcements
        </Link>
      </div>
    );
  }

  const status = announcementStatus(a, campaign ?? undefined);

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        href="/upcoming"
        className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-ink/60 hover:text-ink transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Announcements
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sky is the announcement accent (matches the board's UPCOMING tone). */}
          <div className={`bg-pop-sky p-6 space-y-4 ${POP_PANEL}`}>
            <div className="flex items-center justify-between gap-3">
              <AnnouncementStatusChip status={status} />
              <div className="flex items-center gap-2">
                {a.tokenSymbol && (
                  <span className={`${POP_CHIP} uppercase tracking-wide bg-white/80 text-ink border-ink/25`}>
                    {a.tokenSymbol}
                  </span>
                )}
                <TokenAddressChip tokenAddress={a.tokenAddress} chain={announcementChain} />
              </div>
            </div>
            <h1 className="font-chunk text-2xl md:text-3xl text-ink leading-tight">{a.title}</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-ink/70 font-mono">
              <span className="flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" /> Expected: {fmtExpectedWindow(a)}
              </span>
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> {a.operator}
              </span>
              {/* Always shown (even on the right network) — a shared link must
                  say where the drop lives without a wallet check. */}
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> {chainLabel(announcementChain, a.chainId)}
              </span>
              <AddToCalendar a={a} />
            </div>
            {/* Body sits on its own white card so the markdown text keeps full
                contrast on the sky panel. */}
            <div className="bg-white/80 border border-ink/15 rounded-2xl p-4">
              <Markdown>{a.body}</Markdown>
            </div>
            {a.links.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {a.links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 text-xs ${whiteBtnClass("md")}`}
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-ink/50" /> {l.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Linked campaign — the announcement fulfilled. Status/times come
              from the announcement's chain regardless of the wallet; only the
              claim CTA needs the wallet on the right network. */}
          {a.drop && (
            <div className={`bg-pop-mint p-6 space-y-3 ${POP_PANEL}`}>
              <h3 className={POP_HEADING}>Campaign is on-chain</h3>
              {campaign ? (
                <p className="text-xs text-ink/70 leading-relaxed">
                  Claim window:{" "}
                  {campaign.startTimeUnix === 0n ? "open" : fmtUnixDateTime(campaign.startTimeUnix)} →{" "}
                  {campaign.deadline}
                </p>
              ) : (
                <p className="text-xs text-ink/60 font-mono">
                  Resolving campaign {a.drop.slice(0, 10)}…
                </p>
              )}
              {wrongChain ? (
                <SwitchNetworkCard targetChainId={a.chainId} hasDrop />
              ) : (
                <Link
                  href={`/c/${a.drop}`}
                  className={`inline-flex items-center gap-1.5 text-xs ${inkBtnClass("md")}`}
                >
                  View campaign & claim <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}
          {/* No linked drop yet — a wrong-chain wallet only matters once there
              is something to claim, but flag it early anyway. */}
          {!a.drop && wrongChain && (
            <SwitchNetworkCard targetChainId={a.chainId} hasDrop={false} />
          )}
        </div>

        {/* Aside */}
        <div className="space-y-6">
          <ShareCard
            heading="Share this announcement"
            description="Let eligible wallets know a drop is coming."
            shareText={`${a.title} — upcoming drop on scatter.drop. ${fmtExpectedWindow(a)}.`}
          />
          <OperatorActions id={a.id} operator={a.operator} canceled={a.canceled} />
        </div>
      </div>
    </div>
  );
}

/**
 * "Add to calendar" menu for the announced claim window — Google/Outlook open
 * their prefilled composers in a new tab; Apple has no add-event URL scheme,
 * so it keeps the .ics download. Still the self-contained slice of "remind
 * me" (push/email reminders need external notification infra and stay out of
 * scope).
 */
function AddToCalendar({ a }: { a: Announcement }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Light-dismiss: outside pointer-down or Escape closes the menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const start = new Date(a.expectedStart);
  if (Number.isNaN(start.getTime())) return null;
  const parsedEnd = a.expectedEnd ? new Date(a.expectedEnd) : undefined;
  const end = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : undefined;

  // Calendar details get the body's first paragraph as plain text (composer
  // fields render markdown literally) plus this page's URL. Only built while
  // the menu is open — `open` is always false during prerender, so
  // window.location never runs on the server.
  const event = open
    ? {
        uid: a.id,
        title: `${a.title} — claim window opens`,
        description: mdFirstParagraph(a.body),
        start,
        end,
        url: window.location.href,
      }
    : undefined;

  const itemCls =
    "w-full flex items-center px-3 py-1.5 text-left text-[11px] font-semibold text-ink hover:bg-pop-sky/40 transition";

  return (
    <div ref={menuRef} className="relative">
      {/* Simple disclosure popover, not an ARIA menu — the items are plain
          links/buttons reached by normal tabbing, so menu roles (which imply
          author-managed arrow-key focus) would overpromise to screen readers. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 font-bold text-ink/70 hover:text-ink transition"
        title="Add the expected claim window to your calendar"
      >
        <CalendarPlus className="w-3.5 h-3.5" /> Add to calendar
      </button>
      {event && (
        <div className="absolute left-0 top-full mt-1.5 z-20 min-w-44 bg-white border-2 border-ink rounded-2xl pop-shadow-sm py-1.5 overflow-hidden">
          <a
            href={googleCalendarUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={itemCls}
          >
            Google Calendar
          </a>
          <a
            href={outlookCalendarUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={itemCls}
          >
            Outlook.com
          </a>
          <button
            type="button"
            onClick={() => {
              downloadFile(`drop-${a.id}.ics`, buildIcs(event), "text/calendar;charset=utf-8");
              setOpen(false);
            }}
            className={itemCls}
          >
            Apple Calendar (.ics)
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The announced token's contract address, linked to the announcement chain's
 * block explorer when it has one (plain chip otherwise). Renders nothing when
 * the operator didn't provide an address.
 */
function TokenAddressChip({
  tokenAddress,
  chain,
}: {
  tokenAddress: string | null;
  chain: Chain | undefined;
}) {
  if (!tokenAddress) return null;
  const chipCls = `${POP_CHIP} bg-white/80 text-ink/70 border-ink/25`;
  const href = explorerUrl(chain, "address", tokenAddress);
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={tokenAddress}
      className={`${chipCls} hover:border-ink hover:text-ink transition`}
    >
      {shortAddr(tokenAddress)}
    </a>
  ) : (
    <span title={tokenAddress} className={chipCls}>
      {shortAddr(tokenAddress)}
    </span>
  );
}

/**
 * Shown when the viewer's wallet is on a different network than the
 * announcement. Status and times still render (they're read on the
 * announcement's chain) — the switch is only needed to claim.
 */
function SwitchNetworkCard({
  targetChainId,
  hasDrop,
}: {
  targetChainId: number;
  hasDrop: boolean;
}) {
  const chains = useChains();
  const { isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const target = chains.find((c) => c.id === targetChainId);

  return (
    <div className={`bg-pop-yellow p-6 space-y-3 ${POP_PANEL}`}>
      <h3 className="text-xs font-bold uppercase tracking-wider text-ink font-mono">
        Different network
      </h3>
      <p className="text-xs text-ink/70 leading-relaxed">
        This {hasDrop ? "campaign runs" : "announcement is"} on{" "}
        {target?.name ?? `chain ${targetChainId}`}
        {hasDrop
          ? " — switch your wallet's network to claim."
          : ". You'll need your wallet on that network when the drop goes live."}
      </p>
      {target && (
        <button
          type="button"
          onClick={() => switchChain({ chainId: targetChainId })}
          // Switching needs a connected wallet (matches NetworkSelect's guard).
          disabled={isPending || !isConnected}
          title={isConnected ? undefined : "Connect a wallet first"}
          className={`inline-flex items-center gap-1.5 text-xs disabled:opacity-60 disabled:pointer-events-none ${inkBtnClass("md")}`}
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Switch to {target.name}
        </button>
      )}
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
    <div className={`bg-white p-6 space-y-3 ${POP_PANEL}`}>
      <h3 className={POP_HEADING}>Operator actions</h3>
      <button
        type="button"
        onClick={() => void act()}
        disabled={busy || saving}
        className={`w-full flex items-center justify-center gap-2 text-xs disabled:opacity-60 disabled:pointer-events-none ${whiteBtnClass(
          "lg",
          canceled ? "bg-white" : "bg-pop-pink/40",
        )}`}
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
      {error && <p className="text-[11px] text-rose-500">{error}</p>}
    </div>
  );
}
