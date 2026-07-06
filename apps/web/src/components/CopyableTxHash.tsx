"use client";

import type { Chain } from "viem";
import { CopyButton } from "@/components/CopyButton";
import { TxHashLink } from "@/components/TxHashLink";

/**
 * A transaction hash shown as an explorer link plus a copy button — the copy
 * is the fallback on chains without an explorer (e.g. the local fork). Shared
 * by the claim success panel and the manage page's creation-tx line so the
 * "link + copy" pair stays consistent.
 */
export function CopyableTxHash({ hash, chain }: { hash: `0x${string}`; chain?: Chain }) {
  return (
    <>
      <TxHashLink hash={hash} chain={chain} />
      <CopyButton value={hash} label="Copy transaction hash" />
    </>
  );
}
