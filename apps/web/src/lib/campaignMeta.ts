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
