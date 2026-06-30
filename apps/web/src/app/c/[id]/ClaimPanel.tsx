"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, zeroAddress } from "viem";
import {
  buildClaimRequest,
  isVerificationValid,
} from "@tokamak-network/scatter-drop-sdk";
import { CheckCircle2, Gift, Loader2, XCircle } from "lucide-react";
import { ConnectGate } from "@/components/ConnectGate";
import { TxButton } from "@/components/TxButton";
import { useIsClaimed, useVerifiedUntil } from "@/lib/contracts";
import { getStubEligibility, type Campaign } from "@/lib/stub";

/**
 * Claims portal (campaign detail, right column). Live: identity gate
 * (verifiedUntil), claim window (startTime/deadline), on-chain isClaimed, and
 * the real MerkleDrop.claim tx (SDK buildClaimRequest). Eligibility proof comes
 * from the off-chain stub seam.
 */
export function ClaimPanel({ campaign }: { campaign: Campaign }) {
  const { address } = useAccount();
  const now = BigInt(Math.floor(Date.now() / 1000));

  const { data: elig, isPending: eligLoading } = useQuery({
    queryKey: ["eligibility", campaign.id, address],
    queryFn: () => getStubEligibility(campaign.id, address),
    enabled: !!address,
  });
  // W24: identityRegistry == 0 means an open campaign — no identity check.
  const gateOff = campaign.identityRegistry === zeroAddress;
  const { data: verifiedUntil, isLoading: gateLoading } = useVerifiedUntil(
    gateOff ? undefined : campaign.identityRegistry,
    address,
  );
  const { data: claimedOnChain, isLoading: claimLoading } = useIsClaimed(
    campaign.drop,
    elig?.claim?.index,
  );

  const verified =
    gateOff ||
    (verifiedUntil !== undefined && isVerificationValid(verifiedUntil, now));
  const notStarted = campaign.startTimeUnix > now;
  const ended = now > campaign.deadlineUnix;
  const windowOpen = !notStarted && !ended;
  const amount = elig?.claim
    ? `${formatUnits(BigInt(elig.claim.amount), 18)} ${campaign.tokenSymbol}`
    : null;

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
            : !elig?.eligible
              ? "Not eligible"
              : "Claim";

  return (
    <div className="space-y-6">
      {/* Pool */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
          Campaign Pool
        </h3>
        <div className="text-2xl font-bold text-slate-100">
          {campaign.totalAmount}
        </div>
        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/50">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
            style={{ width: `${Math.min(100, campaign.claimedPct)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs font-mono text-slate-500">
          <span>Claimed: {campaign.claimedPct}%</span>
          <span>
            {notStarted
              ? "Starts soon"
              : ended
                ? "Ended"
                : `Ends ${campaign.deadline}`}
          </span>
        </div>
      </div>

      {/* Eligibility + claim */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
          <Gift className="w-4 h-4 text-indigo-500" />
          Eligibility check
        </h3>

        <ConnectGate prompt="Connect a wallet to check your eligibility.">
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 flex gap-2 items-start">
            {eligLoading ? (
              <Loader2 className="w-4 h-4 text-slate-500 animate-spin shrink-0 mt-0.5" />
            ) : elig?.eligible ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
            )}
            <div className="text-xs space-y-0.5">
              <div className="font-bold text-slate-300">
                {eligLoading
                  ? "Checking eligibility…"
                  : elig?.eligible && amount
                    ? `Eligible for ${amount}`
                    : "Not eligible"}
              </div>
              <div className="text-slate-500 text-[11px] leading-snug">
                {eligLoading
                  ? "Verifying your address against the distribution list…"
                  : elig?.eligible
                    ? "Your address is in the distribution list."
                    : "This wallet is not in the distribution list for this campaign."}
              </div>
            </div>
          </div>

          <div className="pt-1">
            <TxButton
              request={claimRequest}
              label={claimLabel}
              primary
              disabled={!canClaim}
            />
            <p className="text-[11px] text-slate-500 font-mono mt-2">
              {gateOff
                ? "Open claim (no identity check) AND eligible AND window open. Self-claim only."
                : "Requires (identity verified) AND (eligible) AND (window open). Self-claim only."}
            </p>
            {claimedOnChain && (
              <Link
                href={`/c/${campaign.id}/receipt`}
                className="text-[11px] text-emerald-600 underline mt-2 inline-block"
              >
                Tax receipt →
              </Link>
            )}
          </div>
        </ConnectGate>
      </div>
    </div>
  );
}
