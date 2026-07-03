"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { zeroAddress } from "viem";
import { airdropTypeLabel, isVerificationValid } from "@tokamak-network/scatter-drop-sdk";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Link as LinkIcon,
  Loader2,
  Send,
  Share2,
  Twitter,
} from "lucide-react";
import { IdentityGate } from "@/components/IdentityGate";
import { useVerifiedUntil } from "@/lib/contracts";
import { fmtUnixDateTime, useCampaign } from "@/lib/campaigns";
import { ClaimPanel } from "./ClaimPanel";

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: campaign, isPending, isError } = useCampaign(id);
  const { address } = useAccount();
  const { data: verifiedUntil } = useVerifiedUntil(
    campaign?.identityRegistry,
    address,
  );

  if (isPending) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (isError || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-slate-600" />
        <p className="text-slate-400 text-sm">
          {isError
            ? "Could not load campaign. Is the fork running?"
            : "This campaign is not on-chain on the connected network."}
        </p>
        <Link href="/campaigns" className="text-emerald-600 text-sm hover:underline">
          ← Explore campaigns
        </Link>
      </div>
    );
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const open = campaign.identityRegistry === zeroAddress;
  const startsAt =
    campaign.startTimeUnix > 0n
      ? fmtUnixDateTime(campaign.startTimeUnix)
      : "At launch";
  // Open campaigns (identityRegistry == 0) skip verification entirely — the
  // registry read never runs, so without this branch the card would sit on
  // "checking…" forever.
  const gateState = open
    ? "open"
    : !address
      ? "unverified"
      : verifiedUntil === undefined
        ? "loading"
        : isVerificationValid(verifiedUntil, now)
          ? "verified"
          : "unverified";

  return (
    <div className="space-y-8 animate-fade-in">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-100 transition text-sm font-mono"
      >
        <ArrowLeft className="w-4 h-4" />
        BACK TO DIRECTORY
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: campaign info + identity gate */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row gap-5 items-start">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-bold text-base text-emerald-600 shrink-0">
                {campaign.tokenSymbol.slice(0, 4)}
              </div>
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase tracking-wide bg-slate-950 text-slate-400 border-slate-800">
                    {airdropTypeLabel(campaign.type)}
                  </span>
                  {campaign.status === "active" ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-950 text-slate-400 border border-slate-800">
                      Ended
                    </span>
                  )}
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-slate-50">
                  {campaign.name}
                </h1>
                <p className="text-xs text-slate-400 font-mono">
                  Operator:{" "}
                  <span className="text-slate-200">
                    {campaign.operator.slice(0, 10)}…{campaign.operator.slice(-8)}
                  </span>
                </p>
              </div>
            </div>

            <p className="text-slate-300 text-sm leading-relaxed border-t border-slate-800/80 pt-4">
              {campaign.description}
            </p>

            {/* Quick facts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatItem label="Type" value={airdropTypeLabel(campaign.type)} />
              <StatItem
                label="Access"
                value={open ? "Open claim" : "Identity-gated"}
              />
              <StatItem label="Starts" value={startsAt} />
              <StatItem
                label="Ends"
                value={campaign.deadline === "No deadline" ? "—" : campaign.deadline}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-lg border border-slate-800/60 text-xs font-mono">
              <AddressField label="Airdrop Token" value={campaign.token} />
              <AddressField label="Drop Contract" value={campaign.drop} />
            </div>
          </div>

          <TimelineCard
            startUnix={campaign.startTimeUnix}
            endUnix={campaign.deadlineUnix}
            startLabel={startsAt}
            endLabel={
              campaign.deadline === "No deadline" ? "No deadline" : campaign.deadline
            }
          />

          <IdentityGate state={gateState} registryLabel={campaign.identityRegistryLabel} />
        </div>

        {/* Right: claims portal + share */}
        <div className="space-y-6">
          <ClaimPanel campaign={campaign} />
          <ShareCard
            name={campaign.name}
            tagline={campaign.description}
            amount={campaign.totalAmount}
          />
        </div>
      </div>
    </div>
  );
}

function days(seconds: number): string {
  const d = Math.max(0, Math.ceil(seconds / 86400));
  return `${d} day${d === 1 ? "" : "s"}`;
}

/** Claim-window timeline with elapsed/remaining. */
function TimelineCard({
  startUnix,
  endUnix,
  startLabel,
  endLabel,
}: {
  startUnix: bigint;
  endUnix: bigint;
  startLabel: string;
  endLabel: string;
}) {
  const nowS = Math.floor(Date.now() / 1000);
  const start = Number(startUnix);
  const end = Number(endUnix);
  const hasWindow = start > 0 && end > start;
  const pct = hasWindow
    ? Math.min(100, Math.max(0, ((nowS - start) / (end - start)) * 100))
    : 0;

  const status =
    start > nowS
      ? `Starts in ${days(start - nowS)}`
      : nowS > end
        ? `Ended ${days(nowS - end)} ago`
        : `${days(end - nowS)} left`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
        <Clock className="w-4 h-4 text-emerald-600" /> Timeline
      </h3>
      <div className="flex justify-between text-xs">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
            Starts
          </div>
          <div className="text-sm font-semibold text-slate-100 mt-0.5">
            {startLabel}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
            Ends
          </div>
          <div className="text-sm font-semibold text-slate-100 mt-0.5">
            {endLabel}
          </div>
        </div>
      </div>
      {hasWindow && (
        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/50">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <div className="text-xs font-mono text-emerald-600">{status}</div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-950 border border-slate-800/60 px-3 py-2.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="text-sm font-semibold text-slate-100 mt-0.5 truncate">
        {value}
      </div>
    </div>
  );
}

function AddressField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 min-w-0">
      <span className="text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-slate-300 truncate font-semibold select-all">
          {value}
        </span>
        <CopyButton value={value} label={`Copy ${label}`} />
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={copied ? "Copied" : label}
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="shrink-0 text-slate-500 hover:text-emerald-600 transition"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-600" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

/** Share / promote the campaign — copy link + one-tap social intents. */
function ShareCard({
  name,
  tagline,
  amount,
}: {
  name: string;
  tagline: string;
  amount: string;
}) {
  const [copied, setCopied] = useState(false);
  const shareText = `${name} — ${amount} up for grabs on scatter.drop. ${tagline}`;

  function href() {
    return typeof window !== "undefined" ? window.location.href : "";
  }
  function open(url: string) {
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
          <Share2 className="w-4 h-4 text-emerald-600" />
          Share this drop
        </h3>
        <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
          Spread the word — let eligible wallets know they can claim.
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(href());
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="w-full flex items-center justify-center gap-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-100 text-sm font-semibold px-4 py-2.5 rounded-lg transition"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-emerald-600" /> Link copied
          </>
        ) : (
          <>
            <LinkIcon className="w-4 h-4 text-slate-400" /> Copy link
          </>
        )}
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() =>
            open(
              `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                shareText,
              )}&url=${encodeURIComponent(href())}`,
            )
          }
          className="flex items-center justify-center gap-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg transition"
        >
          <Twitter className="w-3.5 h-3.5" /> Post on X
        </button>
        <button
          type="button"
          onClick={() =>
            open(
              `https://t.me/share/url?url=${encodeURIComponent(
                href(),
              )}&text=${encodeURIComponent(shareText)}`,
            )
          }
          className="flex items-center justify-center gap-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg transition"
        >
          <Send className="w-3.5 h-3.5" /> Telegram
        </button>
      </div>
    </div>
  );
}
