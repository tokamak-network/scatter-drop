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
  value: string,
): string | undefined {
  const base = chain?.blockExplorers?.default?.url;
  return base ? `${base.replace(/\/+$/, "")}/${kind}/${value}` : undefined;
}
