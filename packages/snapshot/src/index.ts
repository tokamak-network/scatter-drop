import type { PublicClient } from "viem";
import { buildDrop, type DropManifest } from "@tokamak-network/scatter-drop-merkle";
import { scanHolders, type ScanOptions } from "./scan.js";
import { allocate, totalOf } from "./allocate.js";
import type { AllocationMode, SnapshotParams } from "./types.js";

export type {
  Holder,
  AllocationMode,
  SnapshotParams,
  ScanProgress,
  TokenStandard,
} from "./types.js";
export { scanHolders, type ScanOptions } from "./scan.js";
export { allocate, totalOf } from "./allocate.js";

/** Result of a full snapshot → allocation → merkle build. */
export interface SnapshotResult extends DropManifest {
  /** Number of holders that passed the minBalance filter. */
  holderCount: number;
}

/**
 * End-to-end snapshot: scan holders at a block, allocate amounts, build the
 * Merkle drop. Server-side only (`client` carries the RPC key). The returned
 * `merkleRoot` + `totalAmount` feed `DropFactory.createDrop`; `claims` are the
 * per-recipient proofs (store off-chain / IPFS).
 */
export async function buildSnapshotDrop(
  client: PublicClient,
  params: SnapshotParams,
  mode: AllocationMode,
  opts?: ScanOptions,
): Promise<SnapshotResult> {
  const holders = await scanHolders(client, params, opts);
  if (holders.length === 0) {
    throw new Error("buildSnapshotDrop: no holders matched the snapshot criteria");
  }
  const entries = allocate(holders, mode);
  if (entries.length === 0) {
    throw new Error("buildSnapshotDrop: allocation produced no non-zero recipients");
  }
  const manifest = buildDrop(entries);
  return { ...manifest, holderCount: holders.length };
}

/** Re-export for callers that only want the total of an allocation. */
export { totalOf as allocationTotal } from "./allocate.js";
