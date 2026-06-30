"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import {
  buildClaimRequest,
  isVerificationValid,
  isClaimWindowOpen,
  type ClaimRequest,
} from "@tokamak-network/scatter-drop-sdk";
import { ConnectGate } from "@/components/ConnectGate";
import { IdentityGate } from "@/components/IdentityGate";
import { EligibilityCheck } from "@/components/EligibilityCheck";
import { CalldataPreview } from "@/components/CalldataPreview";
import {
  getStubEligibility,
  getStubVerifiedUntil,
  type Campaign,
} from "@/lib/stub";

/**
 * Claim flow for a campaign detail page.
 *   IdentityGate     → SDK isVerificationValid(verifiedUntil, now)
 *   EligibilityCheck → stub proof lookup (proofs.json / on-chain in M5)
 *   [Prepare claim]  → SDK buildClaimRequest(drop, proof) → calldata preview
 *
 * Reads go through the async stub seam (swapped for wagmi/anvil in M5); the
 * wallet send of the prepared calldata is wired in M5 too.
 */
export function ClaimPanel({ campaign }: { campaign: Campaign }) {
  const { address } = useAccount();
  const [request, setRequest] = useState<ClaimRequest | null>(null);
  // Computed at render so gate/window checks stay accurate across a deadline
  // boundary. In M5 the gate reads chain block.timestamp via SDK
  // getIdentityStatus; this client clock is only the stub stand-in.
  const now = BigInt(Math.floor(Date.now() / 1000));

  const identity = useQuery({
    queryKey: ["identity", campaign.identityRegistry, address],
    queryFn: () => getStubVerifiedUntil(campaign.identityRegistry, address),
    enabled: !!address,
  });
  const eligibility = useQuery({
    queryKey: ["eligibility", campaign.id, address],
    queryFn: () => getStubEligibility(campaign.id, address),
    enabled: !!address,
  });

  const verified =
    identity.data !== undefined && isVerificationValid(identity.data, now);
  const windowOpen = isClaimWindowOpen(campaign.deadlineUnix, now);
  const elig = eligibility.data;

  const gateState =
    identity.isLoading || identity.data === undefined
      ? "loading"
      : verified
        ? "verified"
        : "unverified";

  const eligState = eligibility.isLoading
    ? "loading"
    : !elig?.eligible
      ? "ineligible"
      : elig.alreadyClaimed
        ? "claimed"
        : "eligible";

  const amountDisplay = elig?.claim
    ? `${formatUnits(BigInt(elig.claim.amount), 18)} ${campaign.tokenSymbol}`
    : undefined;

  const canClaim =
    verified && windowOpen && eligState === "eligible" && !!elig?.claim;

  function prepareClaim() {
    if (!elig?.claim) return;
    setRequest(buildClaimRequest(campaign.drop, elig.claim));
  }

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

          <button
            className="btn btn-primary"
            disabled={!canClaim}
            onClick={prepareClaim}
          >
            {request ? "Claim calldata ready" : "Prepare claim"}
          </button>

          {request && (
            <CalldataPreview
              title="MerkleDrop.claim(index, account, amount, proof)"
              to={request.to}
              data={request.data}
              note="Prepared with SDK buildClaimRequest — wallet send is wired in M5."
            />
          )}

          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Claim requires (identity verified) AND (eligible). Self-claim only.
          </p>
        </div>
      </ConnectGate>
    </div>
  );
}
