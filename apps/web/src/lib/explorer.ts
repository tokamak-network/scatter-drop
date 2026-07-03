import type { Chain } from "viem";

/**
 * Build a block-explorer URL for a transaction or address on `chain`, or
 * `undefined` when the chain exposes no default explorer. Single source of
 * truth so tx/address links stay consistent across the app (new-campaign
 * review, TxButton status, …).
 */
export function explorerUrl(
  chain: Chain | undefined,
  kind: "tx" | "address",
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  const base = chain?.blockExplorers?.default?.url;
  return base
    ? `${base.replace(/\/+$/, "")}/${kind}/${encodeURIComponent(value)}`
    : undefined;
}

/** 0x05fd…1f86-style shortening for inline tx-hash display next to those links. */
export function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-4)}`;
}

/** 0x05fd…1f86-style shortening for inline address display (shorter prefix). */
export function shortAddr(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
