import type { Address } from "viem";

/** Asset standard being snapshotted. Defaults to `erc20` when omitted. */
export type TokenKind = "erc20" | "erc721" | "erc1155";

/** A token holder at the snapshot block. */
export interface Holder {
  address: Address;
  /**
   * Holding at the snapshot block: token base units for `erc20`, or the number
   * of NFTs held for `erc721` / `erc1155` (the count `allocate` weights by).
   */
  balance: bigint;
}

/** How to turn `(holder, balance)` pairs into airdrop amounts. */
export type AllocationMode =
  | { kind: "equal"; perWallet: bigint }
  | { kind: "proRata"; totalAmount: bigint };

/** Inputs for a holder snapshot (one token, one block, a minimum holding). */
export interface SnapshotParams {
  /** Contract to snapshot (ERC-20 / ERC-721 / ERC-1155). */
  token: Address;
  /** Block number to read balances at (must be archive-available). */
  block: bigint;
  /**
   * Minimum holding to include. For `erc20` this is a balance in base units; for
   * `erc721` / `erc1155` it is a minimum count of NFTs held. `0n` = any positive.
   */
  minBalance: bigint;
  /** Lower bound for the Transfer log scan (token deploy block speeds it up). */
  fromBlock?: bigint;
  /** Asset standard. Omitted / `erc20` keeps the original ERC-20 behavior. */
  kind?: TokenKind;
  /** ERC-1155 token id to snapshot (required when `kind === "erc1155"`). */
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
