"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, useChains } from "wagmi";
import { zeroAddress } from "viem";
import { airdropTypeLabel, isVerificationValid } from "@tokamak-network/scatter-drop-sdk";
import { AlertCircle, ArrowLeft, Clock, Loader2 } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { IdentityGate } from "@/components/IdentityGate";
import { inkBtnClass, POP_CHIP, POP_HEADING, POP_PANEL } from "@/components/pop";
import { LiveChip, StatBox } from "@/components/popUi";
import { ShareCard } from "@/components/ShareCard";
import { useVerifiedUntil } from "@/lib/contracts";
import { fmtUnixDateTime, useCampaign } from "@/lib/campaigns";
import { chainLabel, explorerUrl } from "@/lib/explorer";
import { ipfsUrl, useProofsAnchorCid } from "@/lib/proofs";
import { ClaimPanel } from "./ClaimPanel";
import { RecipientsList } from "./RecipientsList";

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
  // The chain this campaign was read from — shown explicitly (and used for
  // explorer links) so contract lookups aren't confused across networks.
  const chainId = useChainId();
  const chains = useChains();
  const currentChain = chains.find((c) => c.id === chainId);
  const { data: proofsCid } = useProofsAnchorCid(campaign ?? undefined);

  if (isPending) {
    return (
      <div className="flex items-center justify-center p-12 text-ink/40">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (isError || !campaign) {
    return (
      <div className={`flex flex-col items-center justify-center p-12 bg-white text-center space-y-3 ${POP_PANEL}`}>
        <AlertCircle className="w-8 h-8 text-ink/40" />
        <p className="text-ink/60 text-sm">
          {isError
            ? "Could not load campaign. Is the fork running?"
            : "This campaign is not on-chain on the connected network."}
        </p>
        <Link href="/campaigns" className={`text-xs ${inkBtnClass("md")}`}>
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
        className="inline-flex items-center gap-2 text-ink/60 hover:text-ink transition text-sm font-mono font-bold"
      >
        <ArrowLeft className="w-4 h-4" />
        BACK TO DIRECTORY
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: campaign info + identity gate */}
        <div className="lg:col-span-2 space-y-6">
          <div className={`bg-white p-6 md:p-8 space-y-6 ${POP_PANEL}`}>
            <div className="flex flex-col md:flex-row gap-5 items-start">
              <div className="w-16 h-16 rounded-full bg-pop-mint border-2 border-ink flex items-center justify-center font-bold text-base text-ink shrink-0">
                {campaign.tokenSymbol.slice(0, 4)}
              </div>
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className={`${POP_CHIP} uppercase tracking-wide bg-pop-cream text-ink border-ink/25`}>
                    {airdropTypeLabel(campaign.type)}
                  </span>
                  {/* Which chain this campaign lives on — contracts below are
                      only meaningful on this network. */}
                  <span className={`${POP_CHIP} uppercase tracking-wide bg-pop-sky/50 text-ink border-ink/25`}>
                    {chainLabel(currentChain, chainId)}
                  </span>
                  {campaign.status === "active" ? (
                    <LiveChip>Active</LiveChip>
                  ) : (
                    <span className={`${POP_CHIP} uppercase text-ink/50 bg-white/60 border-ink/15`}>
                      Ended
                    </span>
                  )}
                </div>
                <h1 className="font-chunk text-2xl md:text-3xl text-ink leading-tight">
                  {campaign.name}
                </h1>
                <p className="text-xs text-ink/60 font-mono">
                  Operator:{" "}
                  <span className="text-ink">
                    {campaign.operator.slice(0, 10)}…{campaign.operator.slice(-8)}
                  </span>
                </p>
              </div>
            </div>

            <p className="text-ink/70 text-sm leading-relaxed border-t border-ink/10 pt-4">
              {campaign.description}
            </p>

            {/* Quick facts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Type" value={airdropTypeLabel(campaign.type)} />
              <StatBox
                label="Access"
                value={open ? "No identity gate" : "Identity-gated"}
              />
              <StatBox label="Starts" value={startsAt} />
              <StatBox
                label="Ends"
                value={campaign.deadline === "No deadline" ? "—" : campaign.deadline}
              />
            </div>

            <div className="space-y-3 bg-pop-cream p-4 rounded-2xl border border-ink/15 text-xs font-mono">
              <div className="text-ink/50">
                Network:{" "}
                <span className="text-ink font-semibold">
                  {currentChain ? `${currentChain.name} (chainId ${chainId})` : `chainId ${chainId}`}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AddressField
                  label="Airdrop Token"
                  value={campaign.token}
                  href={explorerUrl(currentChain, "address", campaign.token)}
                />
                <AddressField
                  label="Drop Contract"
                  value={campaign.drop}
                  href={explorerUrl(currentChain, "address", campaign.drop)}
                />
                {/* On-chain anchored recipient list — the IPFS fallback anyone
                    can open to verify the raw proofs.json exists. */}
                {proofsCid && (
                  <AddressField
                    label="Recipient Proofs (IPFS)"
                    value={proofsCid}
                    href={ipfsUrl(proofsCid)}
                    hrefTitle="Open the anchored proofs.json on the IPFS gateway"
                  />
                )}
              </div>
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

          <RecipientsList campaign={campaign} />
        </div>

        {/* Right: claims portal + share */}
        <div className="space-y-6">
          <ClaimPanel campaign={campaign} />
          <ShareCard
            heading="Share this drop"
            description="Spread the word — let eligible wallets know they can claim."
            shareText={`${campaign.name} — ${campaign.totalAmount} up for grabs on scatter.drop. ${campaign.description}`}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Humanized duration at two-unit precision ("2d 4h", "1h 05m", "12m", "<1m") —
 * the old whole-day ceil showed "Starts in 1 day" for a window opening in an
 * hour.
 */
function duration(seconds: number): string {
  const s = Math.max(0, seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
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
  // Coarse tick so the minute-precision countdown doesn't freeze at whatever
  // it said on the render it happened to be computed in.
  const [nowS, setNowS] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNowS(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(t);
  }, []);
  const start = Number(startUnix);
  const end = Number(endUnix);
  const hasWindow = start > 0 && end > start;
  const pct = hasWindow
    ? Math.min(100, Math.max(0, ((nowS - start) / (end - start)) * 100))
    : 0;

  const status =
    start > nowS
      ? `Starts in ${duration(start - nowS)}`
      : nowS > end
        ? `Ended ${duration(nowS - end)} ago`
        : `${duration(end - nowS)} left`;

  return (
    <div className={`bg-white p-6 space-y-4 ${POP_PANEL}`}>
      <h3 className={`${POP_HEADING} flex items-center gap-1.5`}>
        <Clock className="w-4 h-4 text-ink" /> Timeline
      </h3>
      <div className="flex justify-between text-xs">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink/50">
            Starts
          </div>
          <div className="text-sm font-semibold text-ink mt-0.5">
            {startLabel}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink/50">
            Ends
          </div>
          <div className="text-sm font-semibold text-ink mt-0.5">
            {endLabel}
          </div>
        </div>
      </div>
      {hasWindow && (
        <div className="h-2.5 w-full bg-pop-cream rounded-full overflow-hidden border border-ink/20">
          <div
            className="h-full bg-pop-mint rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <div className="text-xs font-mono font-bold text-ink/70">{status}</div>
    </div>
  );
}

function AddressField({
  label,
  value,
  href,
  hrefTitle,
}: {
  label: string;
  value: string;
  /** Block-explorer address URL — omitted on chains without one (local fork). */
  href?: string;
  /** Link tooltip override for non-explorer targets (e.g. an IPFS gateway). */
  hrefTitle?: string;
}) {
  const linkTitle = hrefTitle ?? `View ${label} on the block explorer`;
  return (
    <div className="space-y-1 min-w-0">
      <span className="text-ink/50">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-ink truncate font-semibold select-all">
          {value}
        </span>
        <CopyButton value={value} label={`Copy ${label}`} />
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={linkTitle}
            title={linkTitle}
            className="text-ink/60 hover:text-ink hover:underline shrink-0"
          >
            ↗
          </a>
        )}
      </div>
    </div>
  );
}
