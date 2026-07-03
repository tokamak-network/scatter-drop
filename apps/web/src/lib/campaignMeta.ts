"use client";

/**
 * Client seam for /api/campaign-meta — the operator-entered name/description
 * that DropCreated doesn't carry on-chain. Published by the wizard right after
 * createDrop confirms; merged into the campaign list at read time. Writes are
 * operator-authenticated (SIWE session + on-chain operator check); `txHash`
 * (the creation tx) lets the server verify via one receipt read.
 */

export type CampaignMetaEntry = { name: string; description: string | null };

/** Best-effort publish, like publishProofs — a failure doesn't block creation. */
export async function publishCampaignMeta(meta: {
  chainId: number;
  drop: string;
  name: string;
  description?: string;
  txHash?: string;
}): Promise<void> {
  try {
    await fetch("/api/campaign-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Edit/backfill a campaign's name+description (operator-authenticated PATCH
 * upsert). Returns the server's error message on failure, null on success —
 * the edit UI surfaces it instead of best-effort swallowing.
 */
export async function editCampaignMeta(meta: {
  chainId: number;
  drop: string;
  name: string;
  description?: string;
}): Promise<string | null> {
  try {
    const res = await fetch("/api/campaign-meta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? `Save failed (HTTP ${res.status})`;
  } catch {
    return "Save failed — network error";
  }
}

/**
 * A chain's campaign metadata, keyed by lowercased drop address. Pass `drop`
 * to fetch just one campaign's entry (single-campaign pages don't need the
 * whole list).
 */
export async function fetchCampaignMetas(
  chainId: number,
  drop?: string,
): Promise<Record<string, CampaignMetaEntry>> {
  try {
    const query = drop
      ? `chainId=${chainId}&drop=${encodeURIComponent(drop.toLowerCase())}`
      : `chainId=${chainId}`;
    const res = await fetch(`/api/campaign-meta?${query}`, {
      cache: "no-store",
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { metas?: Record<string, CampaignMetaEntry> };
    return data.metas ?? {};
  } catch {
    return {};
  }
}
