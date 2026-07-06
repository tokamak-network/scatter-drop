"use client";

import { useChainId, useChains } from "wagmi";
import type { Chain } from "viem";
import { explorerUrl, shortHash } from "@/lib/explorer";

/**
 * Shortened tx hash as an explorer link — or, on chains without an explorer
 * (e.g. the local fork), a plain span that still surfaces the full hash via
 * its title. Pass `chain` to pin a specific network (TxButton pins the chain
 * the tx was sent on); otherwise the wallet's current chain is used.
 */
export function TxHashLink({ hash, chain }: { hash: string; chain?: Chain }) {
  const chainId = useChainId();
  const chains = useChains();
  const resolved = chain ?? chains.find((c) => c.id === chainId);
  const url = explorerUrl(resolved, "tx", hash);
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-emerald-600 hover:underline"
      title={hash}
    >
      {shortHash(hash)} ↗
    </a>
  ) : (
    <span className="font-mono" title={hash}>
      {shortHash(hash)}
    </span>
  );
}
