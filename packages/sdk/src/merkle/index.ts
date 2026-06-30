/**
 * Re-export of the off-chain Merkle generation library so SDK consumers
 * get tree/root/proof building from a single dependency.
 */
export {
  buildDrop,
  verifyClaim,
  parseCsv,
  normalizeEntries,
  leafHash,
  buildTree,
  getProof,
  verifyProof,
  type AirdropEntry,
  type IndexedEntry,
  type ClaimProof,
  type DropManifest,
  type MerkleTree,
} from "@tokamak-network/scatter-drop-merkle";
