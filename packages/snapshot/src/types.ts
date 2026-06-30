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

/** Inputs for a holder snapshot (one ERC-20, one block, a minimum balance). */
export interface SnapshotParams {
  /** ERC-20 token to snapshot. */
  token: Address;
  /** Block number to read balances at (must be archive-available). */
  block: bigint;
  /** Only include holders with balance >= this (base units). 0n = any positive. */
  minBalance: bigint;
  /** Lower bound for the Transfer log scan (token deploy block speeds it up). */
  fromBlock?: bigint;
}

/** Progress callback payload during a scan. */
export interface ScanProgress {
  phase: "logs" | "balances";
  /** Items processed so far in the current phase. */
  done: number;
  /** Total items in the current phase, if known. */
  total?: number;
}
