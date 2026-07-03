"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import type { ClaimProof } from "@tokamak-network/scatter-drop-sdk";
import { getStubEligibility, type Campaign, type Eligibility } from "./stub";

type StoredClaims = Record<string, ClaimProof>;

/** Treat store JSON as untrusted — validate the claim shape before using it. */
function isValidClaim(c: unknown): c is ClaimProof {
  if (!c || typeof c !== "object") return false;
  const x = c as Record<string, unknown>;
  return (
    typeof x.index === "number" &&
    typeof x.account === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(x.account) &&
    typeof x.amount === "string" &&
    /^\d+$/.test(x.amount) &&
    Array.isArray(x.proof) &&
    x.proof.every((p) => typeof p === "string" && /^0x[0-9a-fA-F]{64}$/.test(p))
  );
}

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
  let notPublished = false;
  if (root) {
    try {
      const res = await fetch(`/api/proofs?root=${encodeURIComponent(root)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { claims?: Record<string, unknown> };
        const claim = data.claims?.[address.toLowerCase()];
        return isValidClaim(claim)
          ? { eligible: true, alreadyClaimed: false, claim }
          : { eligible: false, alreadyClaimed: false };
      }
      // 404 = no proofs published for this root → fall through to the stub,
      // and if the stub doesn't know the campaign either, surface "list not
      // published" instead of a false "not on the list".
      if (res.status === 404) notPublished = true;
    } catch {
      /* fall through to stub */
    }
  }
  // No published proofs → dev-fork demo seed (keeps the seeded recipient claimable).
  const stub = await getStubEligibility(campaignId, address);
  return stub.eligible ? stub : { ...stub, notPublished };
}

/**
 * Live eligibility for a campaign: look the connected wallet up in the published
 * proofs (by merkleRoot), falling back to the dev-fork demo stub when none are
 * published. Replaces the demo-only stub lookup.
 */
export function useEligibility(campaign: Campaign | undefined, address: Address | undefined) {
  const root = campaign?.merkleRoot?.toLowerCase() as Hex | undefined;
  return useQuery({
    queryKey: ["eligibility", root ?? campaign?.id, address],
    enabled: !!campaign && !!address,
    queryFn: () => fetchEligibility(campaign!.id, root, address),
  });
}
