"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useEligibility } from "@/lib/proofs";
import { zeroAddress, type TransactionReceipt } from "viem";
import {
  buildClaimRequest,
  isVerificationValid,
} from "@tokamak-network/scatter-drop-sdk";
import { Check, CheckCircle2, Gift, Loader2, Minus, PartyPopper, XCircle } from "lucide-react";
import { ConnectGate } from "@/components/ConnectGate";
import { CopyableTxHash } from "@/components/CopyableTxHash";
import { POP_HEADING, POP_PANEL } from "@/components/pop";
import { StatBox } from "@/components/popUi";
import { TxButton } from "@/components/TxButton";
import { useIsClaimed, useVerifiedUntil } from "@/lib/contracts";
import { formatAmount, fmtUnixDateTime, useCampaignStats, useClaimEvents } from "@/lib/campaigns";
import type { Campaign } from "@/lib/stub";

/**
 * Claims portal (campaign detail, right column). Live: identity gate
 * (verifiedUntil), claim window (startTime/deadline), on-chain isClaimed, and
 * the real MerkleDrop.claim tx (SDK buildClaimRequest). Eligibility proof comes
 * from the off-chain stub seam.
 */
export function ClaimPanel({ campaign }: { campaign: Campaign }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const queryClient = useQueryClient();
  const now = BigInt(Math.floor(Date.now() / 1000));
  const { data: stats } = useCampaignStats(campaign);
  const pct = stats?.pct ?? campaign.claimedPct;
  const startDate =
    campaign.startTimeUnix > 0n ? fmtUnixDateTime(campaign.startTimeUnix) : "now";

  // Hash of the claim just confirmed this session — shows the success panel
  // instantly, before the on-chain isClaimed read and the Claimed-event scan
  // catch up.
  const [justClaimedHash, setJustClaimedHash] = useState<`0x${string}` | null>(null);

  const { data: elig, isPending: eligLoading } = useEligibility(campaign, address);
  // W24: identityRegistry == 0 means an open campaign — no identity check.
  const gateOff = campaign.identityRegistry === zeroAddress;
  const { data: verifiedUntil, isLoading: gateLoading } = useVerifiedUntil(
    gateOff ? undefined : campaign.identityRegistry,
    address,
  );
  const {
    data: claimedOnChain,
    isLoading: claimLoading,
    refetch: refetchClaimed,
  } = useIsClaimed(campaign.drop, elig?.claim?.index);

  // The connected wallet's own Claimed event supplies the revisit state's
  // amount/timestamp/hash. Gate the (RPC-heavy) log scan on having actually
  // claimed — the common never-claimed visit stays a single isClaimed read.
  const { data: claimEvents } = useClaimEvents(campaign, {
    enabled: claimedOnChain === true || justClaimedHash !== null,
  });
  const myClaim = useMemo(() => {
    const me = address?.toLowerCase();
    if (!me || !claimEvents) return undefined;
    // Most recent matching log; self-claim means there is only one.
    return claimEvents.findLast((e) => e.account === me);
  }, [claimEvents, address]);

  // On confirmation, surface the hash and refresh this campaign's pool stats,
  // claim scan, and the on-chain isClaimed flag so Distributed/Remaining and
  // the claimed state stay correct after navigating away and back.
  const onClaimConfirmed = (receipt: TransactionReceipt) => {
    setJustClaimedHash(receipt.transactionHash);
    queryClient.invalidateQueries({ queryKey: ["campaignStats", chainId, campaign.drop] });
    queryClient.invalidateQueries({ queryKey: ["claimEvents", chainId, campaign.drop] });
    void refetchClaimed();
  };

  const verified =
    gateOff ||
    (verifiedUntil !== undefined && isVerificationValid(verifiedUntil, now));
  const notStarted = campaign.startTimeUnix > now;
  const ended = now > campaign.deadlineUnix;
  const windowOpen = !notStarted && !ended;
  // Amount + symbol in the campaign's decimals, formatted once so the
  // eligibility card, the claim button, and the success panel never disagree.
  const withSymbol = (raw: bigint) =>
    `${formatAmount(raw, campaign.decimals ?? 18)} ${campaign.tokenSymbol}`;
  const amount = elig?.claim ? withSymbol(BigInt(elig.claim.amount)) : null;

  // Stay in a loading state until the async checks resolve, so we don't flash
  // "Not eligible" / enable Claim prematurely.
  const isLoading =
    !!address &&
    (eligLoading ||
      (!gateOff && gateLoading) ||
      (!!elig?.eligible && claimLoading));

  const canClaim =
    !isLoading &&
    verified &&
    windowOpen &&
    !!elig?.eligible &&
    claimedOnChain === false &&
    !!elig?.claim;
  const claimRequest =
    canClaim && elig?.claim ? buildClaimRequest(campaign.drop, elig.claim) : null;

  // Single eligibility discriminant so the button label and the status box
  // (title + description) can't drift apart as states are added.
  const eligState = eligLoading
    ? "loading"
    : elig?.eligible
      ? "eligible"
      : elig?.notPublished
        ? "notPublished"
        : "notEligible";
  const ELIG_COPY: Record<
    typeof eligState,
    { title: string; detail: string }
  > = {
    loading: {
      title: "Checking eligibility…",
      detail: "Verifying your address against the distribution list…",
    },
    eligible: {
      title: amount ? `Eligible for ${amount}` : "Eligible",
      detail: "Your address is in the distribution list.",
    },
    notPublished: {
      title: "Recipient list not published",
      detail:
        "The operator hasn't published this campaign's recipient list, so eligibility can't be checked yet.",
    },
    notEligible: {
      title: "Not eligible",
      detail: "This wallet is not in the distribution list for this campaign.",
    },
  };

  // Claimed = the on-chain flag, a live confirmation this session, or the
  // wallet's own past Claimed event (revisit after a reload / new device).
  const claimed = claimedOnChain === true || justClaimedHash !== null || myClaim !== undefined;
  const claimedHash = justClaimedHash ?? myClaim?.txHash;
  // Amount to celebrate: the eligibility proof's figure (present pre-claim, so
  // it survives a same-session claim), else the on-chain event's amount.
  const claimedAmount = amount ?? (myClaim ? withSymbol(myClaim.amount) : null);

  const claimLabel = isLoading
    ? "Checking eligibility…"
    : !verified
      ? "Identity verification required"
      : claimedOnChain
        ? "Already claimed"
        : notStarted
          ? "Claim window not open yet"
          : ended
            ? "Claim window closed"
            : eligState === "notPublished"
              ? "Recipient list not published"
              : eligState === "notEligible"
                ? "Not eligible"
                : "Claim";

  return (
    <div className="space-y-6">
      {/* Pool — mint is the claim-group accent (matches the LIVE tone). */}
      <div className={`bg-pop-mint p-6 space-y-4 ${POP_PANEL}`}>
        <h3 className={POP_HEADING}>Campaign Pool</h3>
        <div className="text-2xl font-chunk text-ink">
          {campaign.totalAmount}
        </div>
        <div className="h-2.5 w-full bg-white/70 rounded-full overflow-hidden border border-ink/20">
          <div
            className="h-full bg-ink rounded-full transition-all"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs font-mono text-ink/60">
          <span>{pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}% distributed</span>
          <span>
            {stats
              ? `${stats.claimedCount} claim${stats.claimedCount === 1 ? "" : "s"}`
              : "…"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatBox label="Distributed" value={stats?.distributed ?? "…"} tone="bg-white/70" />
          <StatBox label="Remaining" value={stats?.remaining ?? "…"} tone="bg-white/70" />
        </div>

        <div className="text-xs font-mono text-ink/60">
          {notStarted
            ? `Starts ${startDate}`
            : ended
              ? "Ended"
              : `Ends ${campaign.deadline}`}
        </div>
      </div>

      {/* Eligibility + claim — becomes a success panel once claimed. */}
      <div className={`bg-white p-6 space-y-5 ${POP_PANEL}`}>
        <h3 className={`${POP_HEADING} flex items-center gap-1.5`}>
          <Gift className="w-4 h-4 text-ink" />
          {claimed ? "Your claim" : "Eligibility check"}
        </h3>

        <ConnectGate prompt="Connect a wallet to check your eligibility.">
          {claimed ? (
            <ClaimedSuccess
              amount={claimedAmount}
              txHash={claimedHash}
              claimedAt={myClaim?.timestamp}
              justNow={justClaimedHash !== null}
              receiptHref={`/c/${campaign.id}/receipt`}
            />
          ) : (
            <>
              <div
                className={`p-4 rounded-2xl border border-ink/15 flex gap-2 items-start ${
                  elig?.eligible ? "bg-pop-mint/40" : "bg-pop-cream"
                }`}
              >
                {eligLoading ? (
                  <Loader2 className="w-4 h-4 text-ink/50 animate-spin shrink-0 mt-0.5" />
                ) : elig?.eligible ? (
                  <CheckCircle2 className="w-4 h-4 text-ink shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-ink/40 shrink-0 mt-0.5" />
                )}
                <div className="text-xs space-y-0.5">
                  <div className="font-bold text-ink">{ELIG_COPY[eligState].title}</div>
                  <div className="text-ink/60 text-[11px] leading-snug">
                    {ELIG_COPY[eligState].detail}
                  </div>
                </div>
              </div>

              <div className="pt-1">
                <TxButton
                  request={claimRequest}
                  label={claimLabel}
                  primary
                  disabled={!canClaim}
                  disableWhenConfirmed
                  onConfirmed={onClaimConfirmed}
                />
                <ul className="mt-3 space-y-1.5 text-[11px]">
                  {!gateOff && <ReqRow ok={verified} label="Identity verified" />}
                  <ReqRow ok={!!elig?.eligible} label="On the distribution list" />
                  <ReqRow ok={windowOpen} label="Claim window open" />
                </ul>
                <p className="text-[11px] text-ink/50 mt-2">
                  Self-claim only — one claim per eligible wallet.
                </p>
              </div>
            </>
          )}
        </ConnectGate>
      </div>

      {/* How to participate */}
      <div className={`bg-white p-6 space-y-3 ${POP_PANEL}`}>
        <h3 className={POP_HEADING}>How to participate</h3>
        <ol className="space-y-1.5 text-[11px] text-ink/70 list-decimal list-inside leading-relaxed">
          <li>
            Connect the wallet that&apos;s on the distribution list — the
            recipient list was fixed when the campaign was created.
          </li>
          {!gateOff && (
            <li>Verify your identity with zk-X509 (one-time, on-chain).</li>
          )}
          <li>
            Wait for the claim window ({startDate} →{" "}
            {campaign.deadline === "No deadline" ? "no deadline" : campaign.deadline}
            ).
          </li>
          <li>
            Press <span className="font-mono font-bold text-ink">Claim</span> — one
            transaction sends the tokens straight to your wallet.
          </li>
        </ol>
        <p className="text-[11px] text-ink/50">
          Not on the list? This campaign can&apos;t be joined after creation —
          check other campaigns on Explore.
        </p>
      </div>
    </div>
  );
}

/**
 * Post-claim success panel: the celebratory amount, the claim's tx hash (as an
 * explorer link plus a copy button — the local fork has no explorer, so copy is
 * the fallback), and a receipt link. Reused for both the just-confirmed moment
 * and the revisit state (an earlier claim, resolved from the Claimed event).
 */
function ClaimedSuccess({
  amount,
  txHash,
  claimedAt,
  justNow,
  receiptHref,
}: {
  amount: string | null;
  txHash?: `0x${string}`;
  /** Unix seconds of the claim block; 0/undefined when not resolved. */
  claimedAt?: number;
  justNow: boolean;
  receiptHref: string;
}) {
  const when = claimedAt ? fmtUnixDateTime(BigInt(claimedAt)) : null;
  return (
    <div className="bg-pop-mint/50 border border-ink/15 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <PartyPopper className="w-5 h-5 text-ink shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-bold text-ink text-sm">
            {amount ? `Claimed ${amount}` : "Claimed"} <Check className="inline w-4 h-4" />
          </div>
          <div className="text-[11px] text-ink/60 leading-snug">
            {justNow
              ? "The tokens are in your wallet."
              : when
                ? `You claimed on ${when}.`
                : "You already claimed this drop."}
          </div>
        </div>
      </div>

      {txHash && (
        <div className="flex items-center gap-2 text-[11px] bg-white/70 border border-ink/15 rounded-xl px-3 py-2">
          <span className="text-ink/50 font-mono shrink-0">tx</span>
          <CopyableTxHash hash={txHash} />
        </div>
      )}

      <Link
        href={receiptHref}
        className="text-[11px] text-ink font-bold underline inline-block"
      >
        Tax receipt →
      </Link>
    </div>
  );
}

function ReqRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <Check className="w-3.5 h-3.5 text-ink shrink-0" />
      ) : (
        <Minus className="w-3.5 h-3.5 text-ink/30 shrink-0" />
      )}
      <span className={ok ? "text-ink" : "text-ink/50"}>{label}</span>
    </li>
  );
}
