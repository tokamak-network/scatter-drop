import { getAddress, type Address } from "viem";
import { buildTree, getProof, leafHash, verifyProof } from "./merkle.js";
import type { AirdropEntry, ClaimProof, DropManifest, IndexedEntry } from "./types.js";

/**
 * Normalize raw entries into deterministically-indexed entries.
 *
 * - Checksums addresses and rejects duplicates (each address may appear once).
 * - Rejects non-positive amounts.
 * - Sorts by address ascending so the same recipient set always yields the
 *   same indices, root, and proofs regardless of input order.
 */
export function normalizeEntries(entries: AirdropEntry[]): IndexedEntry[] {
  if (entries.length === 0) {
    throw new Error("normalizeEntries: recipient list is empty");
  }

  const seen = new Set<string>();
  const normalized = entries.map((e) => {
    const account = getAddress(e.account);
    const key = account.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate recipient: ${account}`);
    }
    seen.add(key);
    if (e.amount <= 0n) {
      throw new Error(`Recipient ${account}: amount must be > 0`);
    }
    return { account, amount: e.amount };
  });

  normalized.sort((a, b) => {
    const x = a.account.toLowerCase();
    const y = b.account.toLowerCase();
    // Return 0 on equality to satisfy strict weak ordering (engine-stable sort).
    return x < y ? -1 : x > y ? 1 : 0;
  });

  return normalized.map((e, index) => ({ ...e, index }));
}

/**
 * Build the full off-chain artifact for a campaign from a recipient list:
 * the on-chain `merkleRoot`, the `totalAmount` to deposit, and a per-address
 * `ClaimProof`. Feed `merkleRoot` + `totalAmount` into `DropFactory.createDrop`.
 */
export function buildDrop(entries: AirdropEntry[]): DropManifest {
  const indexed = normalizeEntries(entries);
  const leaves = indexed.map(leafHash);
  const tree = buildTree(leaves);

  const claims: Record<Address, ClaimProof> = {};
  let totalAmount = 0n;

  indexed.forEach((entry, i) => {
    totalAmount += entry.amount;
    claims[entry.account] = {
      index: entry.index,
      account: entry.account,
      amount: entry.amount.toString(),
      proof: getProof(tree, i),
    };
  });

  return {
    merkleRoot: tree.root,
    totalAmount: totalAmount.toString(),
    count: indexed.length,
    claims,
  };
}

/**
 * Verify a single allocation against a root, mirroring the on-chain check:
 * recompute the leaf and walk the proof with sorted-pair hashing.
 */
export function verifyClaim(merkleRoot: `0x${string}`, claim: ClaimProof): boolean {
  const leaf = leafHash({
    index: claim.index,
    account: getAddress(claim.account),
    amount: BigInt(claim.amount),
  });
  return verifyProof(merkleRoot, leaf, claim.proof);
}
