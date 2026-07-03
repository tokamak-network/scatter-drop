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

/**
 * The validated claims map for a root, or `null` when the store has no proofs
 * for it (404 = the operator hasn't published the list).
 */
async function fetchClaims(root: Hex): Promise<Record<string, ClaimProof> | null> {
  const res = await fetch(`/api/proofs?root=${encodeURIComponent(root)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load proofs");
  const data = (await res.json()) as { claims?: Record<string, unknown> };
  const valid: Record<string, ClaimProof> = {};
  for (const [addr, c] of Object.entries(data.claims ?? {})) {
    if (isValidClaim(c)) valid[addr] = c;
  }
  return valid;
}

/**
 * One proofs download per root — eligibility and the recipients directory
 * both observe this query (same key), so the largest payload on the claim
 * page (up to 50k claims) is fetched once, not once per consumer.
 */
function useClaims(root: Hex | undefined) {
  return useQuery({
    queryKey: ["proofs", root],
    enabled: !!root,
    staleTime: 60_000,
    queryFn: () => fetchClaims(root!),
  });
}

export type RecipientRow = { address: Address; amount: bigint };

/** Shared-query `select` — React Query memoizes this per cached data identity. */
function toRecipientRows(
  claims: Record<string, ClaimProof> | null,
): RecipientRow[] | null {
  if (!claims) return null;
  const rows = Object.entries(claims).map(([address, c]) => ({
    address: address as Address,
    amount: BigInt(c.amount),
  }));
  rows.sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
  return rows;
}

/**
 * A campaign's full published recipient list (from the proofs store), sorted
 * by amount desc, or `null` when the operator hasn't published proofs. Powers
 * the Recipients section — a merkle airdrop's list is public by design
 * (anyone must be able to look up their proof to claim).
 */
export function useRecipients(campaign: Campaign | undefined) {
  const root = campaign?.merkleRoot?.toLowerCase() as Hex | undefined;
  return useQuery({
    queryKey: ["proofs", root],
    enabled: !!root,
    staleTime: 60_000,
    queryFn: () => fetchClaims(root!),
    select: toRecipientRows,
  });
}

/**
 * Live eligibility for a campaign: look the connected wallet up in the published
 * proofs (by merkleRoot), falling back to the dev-fork demo stub when none are
 * published. Derived from the shared per-root claims query — no second download.
 */
export function useEligibility(campaign: Campaign | undefined, address: Address | undefined) {
  const root = campaign?.merkleRoot?.toLowerCase() as Hex | undefined;
  const claimsQ = useClaims(root);
  // undefined while loading/on error; null = not published (404).
  const claims = claimsQ.data;
  return useQuery({
    // dataUpdatedAt keys the derivation to the claims snapshot it read, so a
    // refetched claims map recomputes eligibility (from cache — no network).
    queryKey: ["eligibility", root ?? campaign?.id, address, claimsQ.dataUpdatedAt],
    enabled: !!campaign && !!address && (!root || !claimsQ.isPending),
    queryFn: async (): Promise<Eligibility> => {
      if (claims) {
        const claim = claims[address!.toLowerCase()];
        return claim
          ? { eligible: true, alreadyClaimed: false, claim }
          : { eligible: false, alreadyClaimed: false };
      }
      // No published proofs (404) or fetch error → dev-fork demo seed; unless
      // the stub grants eligibility, surface "list not published" (404 only)
      // instead of a false "not on the list".
      const stub = await getStubEligibility(campaign!.id, address!);
      return stub.eligible ? stub : { ...stub, notPublished: claims === null };
    },
  });
}
