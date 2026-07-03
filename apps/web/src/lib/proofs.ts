"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChainId, usePublicClient } from "wagmi";
import type { Address, Hex, PublicClient } from "viem";
import { verifyClaim, type ClaimProof } from "@tokamak-network/scatter-drop-sdk";
import { useDeployment } from "./contracts";
import type { WebDeployment } from "./deployment";
import { scanLatestProofsCid } from "./dropScan";
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
 * re-published later). Called after `createDrop` confirms. Returns the IPFS
 * CID when the server has pinning configured (null otherwise), so the wizard
 * can offer the on-chain publishProofs(drop, cid) anchor tx.
 */
export async function publishProofs(
  root: Hex,
  claims: Record<string, unknown>,
): Promise<string | null> {
  try {
    const res = await fetch("/api/proofs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root, claims }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { cid?: string | null };
    return data.cid ?? null;
  } catch {
    return null; /* best-effort */
  }
}

/**
 * Validate a raw claims object into an address-keyed ClaimProof map. Each
 * claim's account must match the key it's stored under — a mismatch would
 * attribute the allocation to the wrong row and produce an "eligible" state
 * that MerkleDrop (account == msg.sender) would revert.
 */
function validateClaims(raw: Record<string, unknown>): Record<string, ClaimProof> {
  const valid: Record<string, ClaimProof> = {};
  for (const [addr, c] of Object.entries(raw)) {
    const key = addr.toLowerCase();
    if (isValidClaim(c) && c.account.toLowerCase() === key) valid[key] = c;
  }
  return valid;
}

// Public gateway for reading pinned proofs.json back; override per deployment.
// Trailing slash stripped so a configured "https://gw.io/" doesn't produce "//ipfs/…".
const IPFS_GATEWAY = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io").replace(
  /\/+$/,
  "",
);

/**
 * Recover a campaign's claims from IPFS via its on-chain anchor: latest
 * ProofsPublished(drop) event → CID → gateway fetch. The gateway is an
 * untrusted third party (a plain HTTP fetch doesn't verify the bytes hash to
 * the CID), so every claim is merkle-verified against the campaign's on-chain
 * root before it's shown — the proofs are self-verifying, which is the whole
 * point of a merkle list. Rows that don't verify are dropped.
 */
async function fetchClaimsFromIpfs(
  client: PublicClient,
  dep: WebDeployment,
  drop: Address,
  root: Hex,
): Promise<Record<string, ClaimProof> | null> {
  const cid = await scanLatestProofsCid(client, dep, drop);
  if (!cid) return null;
  const res = await fetch(`${IPFS_GATEWAY}/ipfs/${encodeURIComponent(cid)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as
    | { root?: string; claims?: Record<string, unknown> }
    | null;
  // Untrusted payload: guard the shape, then cheap early bail on an
  // obviously-wrong file before hashing anything.
  if (!data || typeof data !== "object") return null;
  if (data.root?.toLowerCase() !== root) return null;
  const valid = validateClaims(data.claims ?? {});
  const verified: Record<string, ClaimProof> = {};
  for (const [addr, claim] of Object.entries(valid)) {
    if (verifyClaim(root, claim)) verified[addr] = claim;
  }
  return verified;
}

/**
 * The validated claims map for a root, or `null` when no proofs are published
 * anywhere (store 404 and no on-chain IPFS anchor).
 */
async function fetchClaims(
  root: Hex,
  fallback: { client?: PublicClient; dep?: WebDeployment | null; drop?: Address },
): Promise<Record<string, ClaimProof> | null> {
  // A 404 means "nothing published"; any other store failure (500, network)
  // is an outage — try the anchor either way, but only report "not published"
  // when that's actually what the store said.
  let notPublished = false;
  try {
    const res = await fetch(`/api/proofs?root=${encodeURIComponent(root)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { claims?: Record<string, unknown> };
      return validateClaims(data.claims ?? {});
    }
    notPublished = res.status === 404;
  } catch {
    /* store unreachable → try the anchor */
  }
  if (fallback.client && fallback.dep && fallback.drop) {
    try {
      const viaIpfs = await fetchClaimsFromIpfs(
        fallback.client,
        fallback.dep,
        fallback.drop,
        root,
      );
      if (viaIpfs) return viaIpfs;
    } catch {
      /* anchor unavailable too */
    }
  }
  if (notPublished) return null;
  throw new Error("Failed to load proofs");
}

/**
 * One proofs download per root — eligibility and the recipients directory
 * both observe this query (same key), so the largest payload on the claim
 * page (up to 50k claims) is fetched once, not once per consumer. Falls back
 * to the on-chain IPFS anchor when the app's store misses.
 */
function useClaims(campaign: Campaign | undefined) {
  const root = campaign?.merkleRoot?.toLowerCase() as Hex | undefined;
  const chainId = useChainId();
  const client = usePublicClient({ chainId });
  const { data: dep } = useDeployment();
  return useQuery({
    queryKey: ["proofs", root],
    enabled: !!root && dep !== undefined,
    staleTime: 60_000,
    queryFn: () =>
      fetchClaims(root!, { client: client ?? undefined, dep, drop: campaign?.drop }),
  });
}

export type RecipientRow = { address: Address; amount: bigint };

/** Claims map → amount-sorted display rows (memoized by useRecipients). */
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
  const { data, isPending, isError } = useClaims(campaign);
  const rows = useMemo(
    () => (data === undefined ? undefined : toRecipientRows(data)),
    [data],
  );
  return { data: rows, isPending, isError };
}

/**
 * Live eligibility for a campaign: look the connected wallet up in the published
 * proofs (by merkleRoot), falling back to the dev-fork demo stub when none are
 * published. Derived synchronously from the shared per-root claims query — no
 * second download, and background claims refetches don't bounce the result
 * through a pending state.
 */
export function useEligibility(campaign: Campaign | undefined, address: Address | undefined) {
  const root = campaign?.merkleRoot?.toLowerCase() as Hex | undefined;
  const claimsQ = useClaims(campaign);
  // undefined while loading/on error; null = not published (404).
  const claims = claimsQ.data;

  // The stub (dev-fork demo seed) only matters when there's no published list:
  // no root at all, a 404, or a failed proofs fetch.
  const stubEnabled =
    !!campaign && !!address && (!root || claims === null || claimsQ.isError);
  const stubQ = useQuery({
    queryKey: ["eligibility-stub", campaign?.id, address],
    enabled: stubEnabled,
    queryFn: () => getStubEligibility(campaign!.id, address!),
  });

  const data = useMemo((): Eligibility | undefined => {
    if (!campaign || !address) return undefined;
    if (claims) {
      const claim = claims[address.toLowerCase()];
      return claim
        ? { eligible: true, alreadyClaimed: false, claim }
        : { eligible: false, alreadyClaimed: false };
    }
    if (!stubQ.data) return undefined;
    // Unless the stub grants eligibility, surface "list not published"
    // (404 only) instead of a false "not on the list".
    return stubQ.data.eligible
      ? stubQ.data
      : { ...stubQ.data, notPublished: claims === null };
  }, [campaign, address, claims, stubQ.data]);

  const isPending =
    (!!root && claimsQ.isPending) || (stubEnabled && stubQ.isPending);
  return { data, isPending, isError: stubEnabled ? stubQ.isError : claimsQ.isError };
}
