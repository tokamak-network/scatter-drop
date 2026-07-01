import type { Address } from "viem";

/** A token holder at the snapshot block. */
export interface Holder {
  address: Address;
  /** Balance at the snapshot block, in base units. */
  balance: bigint;
}

/** How to turn `(holder, balance)` pairs into airdrop amounts. */
export type AllocationMode =
  | { kind: "equal"; perWallet: bigint }
  | { kind: "proRata"; totalAmount: bigint };

/**
 * Asset standard to snapshot. `erc20` and `erc721` share one code path (both use
 * the `Transfer` event and `balanceOf(address)` — for ERC-721 that returns the
 * owned count). `erc1155` uses `TransferSingle`/`TransferBatch` and
 * `balanceOf(address, id)` for a specific `tokenId`.
 */
export type TokenStandard = "erc20" | "erc721" | "erc1155";

/** Inputs for a holder snapshot (one token/collection, one block, a minimum balance). */
export interface SnapshotParams {
  /** ERC-20/721/1155 contract to snapshot. */
  token: Address;
  /** Block number to read balances at (must be archive-available). */
  block: bigint;
  /** Only include holders with balance/count >= this (base units). 0n = any positive. */
  minBalance: bigint;
  /** Lower bound for the Transfer log scan (deploy block speeds it up). */
  fromBlock?: bigint;
  /** Asset standard. Defaults to `erc20` (also serves `erc721`). */
  kind?: TokenStandard;
  /** Token id — required for `erc1155`. */
  tokenId?: bigint;
}

/** Progress callback payload during a scan. */
export interface ScanProgress {
  phase: "logs" | "balances";
  /** Items processed so far in the current phase (bigint — block numbers can be large). */
  done: bigint;
  /** Total items in the current phase, if known. */
  total?: bigint;
}
