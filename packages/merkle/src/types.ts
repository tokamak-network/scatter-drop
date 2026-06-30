import type { Address, Hex } from "viem";

/** Raw recipient as provided by the operator (CSV row). */
export interface AirdropEntry {
  account: Address;
  amount: bigint;
}

/** Entry with its assigned, stable leaf index. */
export interface IndexedEntry extends AirdropEntry {
  index: number;
}

/**
 * A single claimable allocation with the Merkle proof needed to call
 * `MerkleDrop.claim(index, account, amount, proof)`.
 * `amount` is serialized as a decimal string so the manifest is JSON-safe.
 */
export interface ClaimProof {
  index: number;
  account: Address;
  amount: string;
  proof: Hex[];
}

/**
 * The full off-chain artifact for a campaign: the on-chain `merkleRoot`,
 * the deposited `totalAmount`, and every recipient's proof keyed by address.
 * Stored off-chain (IPFS/S3); the claim page looks up `claims[account]`.
 */
export interface DropManifest {
  merkleRoot: Hex;
  totalAmount: string;
  count: number;
  claims: Record<Address, ClaimProof>;
}
