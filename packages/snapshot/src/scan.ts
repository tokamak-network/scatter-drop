import {
  erc1155Abi,
  erc20Abi,
  erc721Abi,
  getAbiItem,
  getAddress,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import type { Holder, ScanProgress, SnapshotParams, TokenKind } from "./types.js";

// Candidate-collection events, sourced from viem's canonical ABIs (avoids
// hand-written signatures drifting on indexed flags). All carry an indexed
// `to`, so a holder must have received the asset at least once to be a candidate.
const erc20Transfer = getAbiItem({ abi: erc20Abi, name: "Transfer" });
const erc721Transfer = getAbiItem({ abi: erc721Abi, name: "Transfer" });
const erc1155Single = getAbiItem({ abi: erc1155Abi, name: "TransferSingle" });
const erc1155Batch = getAbiItem({ abi: erc1155Abi, name: "TransferBatch" });

const EVENTS_BY_KIND = {
  erc20: [erc20Transfer],
  erc721: [erc721Transfer],
  erc1155: [erc1155Single, erc1155Batch],
} as const;

export interface ScanOptions {
  /** Block span per getLogs call (free-tier RPCs cap this). Default 2000. */
  logChunk?: bigint;
  /** Addresses per multicall batch for balanceOf. Default 500. */
  balanceBatch?: number;
  /** Hard cap on candidate addresses; throws if exceeded (CU-budget guard). */
  maxCandidates?: number;
  onProgress?: (p: ScanProgress) => void;
}

/**
 * Snapshot token holders at a past block via archive RPC. Supports ERC-20,
 * ERC-721, and ERC-1155 (`params.kind`, default `erc20`).
 *
 * 1. Scan the standard's transfer event(s) from `fromBlock..block` (chunked) →
 *    candidate set = every address that ever *received* the asset (the zero
 *    address, i.e. mints/burns, is excluded). For ERC-1155 only receipts of the
 *    target `tokenId` count, so a multi-id contract doesn't inflate the set.
 * 2. Read the holding at `blockTag: block` (batched multicall) → keep those
 *    `>= minBalance`. For ERC-20 the holding is `balanceOf(addr)` in base units;
 *    for ERC-721 it is `balanceOf(addr)` (number of NFTs held); for ERC-1155 it
 *    is `balanceOf(addr, tokenId)` (count of that id). Non-bigint / failed
 *    results are skipped.
 *
 * Requires an **archive** node for the historical balance read (Alchemy free
 * tier qualifies). `client` must be a server-side PublicClient — never expose
 * its transport (RPC key) to the browser.
 */
export async function scanHolders(
  client: PublicClient,
  params: SnapshotParams,
  opts: ScanOptions = {},
): Promise<Holder[]> {
  const { token, block, minBalance, fromBlock = 0n, tokenId } = params;
  const kind: TokenKind = params.kind ?? "erc20";
  const logChunk = opts.logChunk ?? 2000n;
  const balanceBatch = opts.balanceBatch ?? 500;

  // Validate iteration controls — a non-positive value would make a loop never
  // advance (infinite loop / no progress).
  if (logChunk <= 0n) throw new Error("scanHolders: logChunk must be > 0");
  if (balanceBatch <= 0) throw new Error("scanHolders: balanceBatch must be > 0");
  if (block < fromBlock) throw new Error("scanHolders: block must be >= fromBlock");
  if (kind === "erc1155" && tokenId === undefined) {
    throw new Error("scanHolders: erc1155 requires a tokenId");
  }

  // --- 1. candidate addresses from transfer `to` (chunked log scan) ---
  const candidates = new Set<Address>();
  let processed = 0n;
  const span = block - fromBlock + 1n;
  for (let start = fromBlock; start <= block; start += logChunk) {
    const end = start + logChunk - 1n > block ? block : start + logChunk - 1n;
    const logs = await client.getLogs({
      address: token,
      events: EVENTS_BY_KIND[kind],
      fromBlock: start,
      toBlock: end,
    });
    for (const log of logs) {
      const args = log.args as { to?: Address; id?: bigint; ids?: readonly bigint[] } | undefined;
      const to = args?.to;
      if (!to) continue;
      // ERC-1155 emits transfers for every id; keep only receipts of the target
      // id so phase 2's multicall stays proportional to the real holder set.
      if (kind === "erc1155" && args!.id !== tokenId && !(args!.ids?.includes(tokenId!) ?? false)) {
        continue;
      }
      const addr = getAddress(to);
      if (addr !== zeroAddress) candidates.add(addr); // skip mint/burn sink
    }
    processed += end - start + 1n;
    opts.onProgress?.({ phase: "logs", done: processed, total: span });
    if (opts.maxCandidates && candidates.size > opts.maxCandidates) {
      throw new Error(
        `scanHolders: candidate set exceeded maxCandidates (${opts.maxCandidates}); narrow the range or raise the cap`,
      );
    }
  }

  // --- 2. balance read at the snapshot block (batched multicall) ---
  // ERC-20 and ERC-721 share the same `balanceOf(address) -> uint256`, so the
  // 1-arg path uses `erc20Abi` for both; ERC-1155 needs the id. The per-address
  // ternary stays inside the map: hoisting it to pick between two whole arrays
  // trips viem's multicall inference (array-of-unions is fine, union-of-arrays
  // is not), and the branch cost is dwarfed by the RPC round-trip anyway.
  const list = [...candidates];
  const holders: Holder[] = [];
  for (let i = 0; i < list.length; i += balanceBatch) {
    const batch = list.slice(i, i + balanceBatch);
    const results = await client.multicall({
      blockNumber: block,
      allowFailure: true,
      contracts: batch.map((address) =>
        kind === "erc1155"
          ? {
              address: token,
              abi: erc1155Abi,
              functionName: "balanceOf" as const,
              args: [address, tokenId!] as const,
            }
          : {
              address: token,
              abi: erc20Abi,
              functionName: "balanceOf" as const,
              args: [address] as const,
            },
      ),
    });
    results.forEach((r, j) => {
      // Only trust a successful call that actually returned a bigint — a
      // non-standard token could return something else; don't coerce it.
      if (r.status === "success" && typeof r.result === "bigint") {
        const balance = r.result;
        if (balance > 0n && balance >= minBalance) {
          holders.push({ address: batch[j]!, balance });
        }
      }
    });
    opts.onProgress?.({
      phase: "balances",
      done: BigInt(Math.min(i + batch.length, list.length)),
      total: BigInt(list.length),
    });
  }

  return holders;
}
