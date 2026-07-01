"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import type { ClaimProof } from "@tokamak-network/scatter-drop-sdk";
import { getStubEligibility, type Campaign, type Eligibility } from "./stub";

type StoredClaims = Record<string, ClaimProof>;

/**
 * Publish a campaign's per-recipient proofs to the store, keyed by merkleRoot.
 * Best-effort — a failure doesn't block campaign creation (proofs can be
 * re-published later). Called after `createDrop` confirms.
 */
export async function publishProofs(
  root: Hex,
  claims: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch("/api/proofs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root, claims }),
    });
  } catch {
    /* best-effort */
  }
}

async function fetchEligibility(
  campaignId: string,
  root: Hex | undefined,
  address: Address | undefined,
): Promise<Eligibility> {
  if (!address) return { eligible: false, alreadyClaimed: false };
  if (root) {
    try {
      const res = await fetch(`/api/proofs?root=${root}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { claims?: StoredClaims };
        const claim = data.claims?.[address.toLowerCase()];
        return claim
          ? { eligible: true, alreadyClaimed: false, claim }
          : { eligible: false, alreadyClaimed: false };
      }
      // 404 = no proofs published for this root yet → fall through to the stub.
    } catch {
      /* fall through to stub */
    }
  }
  // No published proofs → dev-fork demo seed (keeps the seeded recipient claimable).
  return getStubEligibility(campaignId, address);
}

/**
 * Live eligibility for a campaign: look the connected wallet up in the published
 * proofs (by merkleRoot), falling back to the dev-fork demo stub when none are
 * published. Replaces the demo-only stub lookup.
 */
export function useEligibility(campaign: Campaign | undefined, address: Address | undefined) {
  return useQuery({
    queryKey: ["eligibility", campaign?.merkleRoot ?? campaign?.id, address],
    enabled: !!campaign && !!address,
    queryFn: () => fetchEligibility(campaign!.id, campaign!.merkleRoot, address),
  });
}
