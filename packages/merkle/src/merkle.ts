import { concatHex, encodePacked, keccak256, type Hex } from "viem";
import type { IndexedEntry } from "./types.js";

/**
 * Leaf hash for a MerkleDrop allocation.
 *
 * MUST stay byte-for-byte identical to the contract:
 *   keccak256(abi.encodePacked(index, account, amount))
 * with index/amount as uint256 and account as address.
 */
export function leafHash(entry: IndexedEntry): Hex {
  return keccak256(
    encodePacked(
      ["uint256", "address", "uint256"],
      [BigInt(entry.index), entry.account, entry.amount],
    ),
  );
}

/**
 * Hash an internal node from two children using sorted-pair ordering,
 * matching OpenZeppelin `MerkleProof` (commutative hashing). This lets the
 * on-chain verifier accept proofs without sibling-position metadata.
 */
export function hashPair(a: Hex, b: Hex): Hex {
  return a.toLowerCase() <= b.toLowerCase()
    ? keccak256(concatHex([a, b]))
    : keccak256(concatHex([b, a]));
}

export interface MerkleTree {
  root: Hex;
  /** layers[0] = leaves, layers[n] = [root]. */
  layers: Hex[][];
}

/**
 * Build a Merkle tree over pre-hashed leaves using sorted-pair hashing.
 * An odd node at any level is promoted unchanged to the next level.
 */
export function buildTree(leaves: Hex[]): MerkleTree {
  if (leaves.length === 0) {
    throw new Error("buildTree: at least one leaf is required");
  }

  const layers: Hex[][] = [leaves];
  while (layers[layers.length - 1]!.length > 1) {
    const current = layers[layers.length - 1]!;
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = i + 1 < current.length ? current[i + 1]! : undefined;
      next.push(right === undefined ? left : hashPair(left, right));
    }
    layers.push(next);
  }

  return { root: layers[layers.length - 1]![0]!, layers };
}

/** Build the inclusion proof (sibling hashes, bottom-up) for a leaf index. */
export function getProof(tree: MerkleTree, leafIndex: number): Hex[] {
  if (leafIndex < 0 || leafIndex >= tree.layers[0]!.length) {
    throw new Error(`getProof: leaf index ${leafIndex} out of range`);
  }

  const proof: Hex[] = [];
  let index = leafIndex;
  for (let level = 0; level < tree.layers.length - 1; level++) {
    const layer = tree.layers[level]!;
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    if (siblingIndex < layer.length) {
      proof.push(layer[siblingIndex]!);
    }
    index = Math.floor(index / 2);
  }
  return proof;
}

/** Verify a proof against a root using the same sorted-pair hashing. */
export function verifyProof(root: Hex, leaf: Hex, proof: Hex[]): boolean {
  let computed = leaf;
  for (const sibling of proof) {
    computed = hashPair(computed, sibling);
  }
  return computed.toLowerCase() === root.toLowerCase();
}
