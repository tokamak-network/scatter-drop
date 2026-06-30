"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import {
  buildClaimRequest,
  isVerificationValid,
  isClaimWindowOpen,
} from "@tokamak-network/scatter-drop-sdk";
import { ConnectGate } from "@/components/ConnectGate";
import { IdentityGate } from "@/components/IdentityGate";
import { EligibilityCheck } from "@/components/EligibilityCheck";
import { TxButton } from "@/components/TxButton";
import { useIsClaimed, useVerifiedUntil } from "@/lib/contracts";
import { getStubEligibility, type Campaign } from "@/lib/stub";

/**
 * Claim flow for a campaign detail page (M5 — live).
 *   IdentityGate     → live IdentityRegistry.verifiedUntil + SDK isVerificationValid
 *   EligibilityCheck → off-chain proof (stub seam / seed manifest) + live isClaimed
 *   [Claim]          → real MerkleDrop.claim tx (SDK buildClaimRequest calldata)
 *
 * Live reads require the campaign's drop/registry to be real on-chain contracts
 * (the seeded demo campaign on the dev fork). For the placeholder stub campaigns
 * the gate stays "checking/unverified" and claim is disabled.
 */
export function ClaimPanel({ campaign }: { campaign: Campaign }) {
  const { address } = useAccount();
  const now = BigInt(Math.floor(Date.now() / 1000));

  // Off-chain eligibility (Merkle proof) — stub seam; the proof feeds the claim.
  const { data: elig } = useQuery({
    queryKey: ["eligibility", campaign.id, address],
    queryFn: () => getStubEligibility(campaign.id, address),
    enabled: !!address,
  });

  // Live identity gate + live claimed flag.
  const { data: verifiedUntil, isLoading: gateLoading } = useVerifiedUntil(
    campaign.identityRegistry,
    address,
  );
  const { data: claimedOnChain } = useIsClaimed(campaign.drop, elig?.claim?.index);

  const verified =
    verifiedUntil !== undefined && isVerificationValid(verifiedUntil, now);
  const windowOpen = isClaimWindowOpen(campaign.deadlineUnix, now);

  const gateState =
    !address || gateLoading || verifiedUntil === undefined
      ? "loading"
      : verified
        ? "verified"
        : "unverified";

  const eligState = !elig
    ? "loading"
    : claimedOnChain
      ? "claimed"
      : !elig.eligible
        ? "ineligible"
        : "eligible";

  const amountDisplay = elig?.claim
    ? `${formatUnits(BigInt(elig.claim.amount), 18)} ${campaign.tokenSymbol}`
    : undefined;

  const canClaim =
    verified && windowOpen && eligState === "eligible" && !!elig?.claim;
  const claimRequest =
    canClaim && elig?.claim ? buildClaimRequest(campaign.drop, elig.claim) : null;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Claim</h3>

      <ConnectGate prompt="Connect a wallet to check your eligibility.">
        <div style={{ display: "grid", gap: 12 }}>
          <IdentityGate
            state={gateState}
            registryLabel={campaign.identityRegistryLabel}
          />
          <EligibilityCheck state={eligState} amount={amountDisplay} />

          {!windowOpen && (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Claim window closed ({campaign.deadline}).
            </p>
          )}

          <TxButton request={claimRequest} label="Claim" primary disabled={!canClaim} />

          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Claim requires (identity verified) AND (eligible). Self-claim only.
          </p>

          {eligState === "claimed" && (
            <Link
              href={`/c/${campaign.id}/receipt`}
              className="muted"
              style={{ fontSize: 13, textDecoration: "underline" }}
            >
              Tax receipt →
            </Link>
          )}
        </div>
      </ConnectGate>
    </div>
  );
}
