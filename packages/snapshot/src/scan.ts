import { getAddress, parseAbi, type Address, type PublicClient } from "viem";
import type { Holder, ScanProgress, SnapshotParams } from "./types.js";

const [transferEvent] = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

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
 * Snapshot ERC-20 holders at a past block via archive RPC.
 *
 * 1. Scan `Transfer` logs from `fromBlock..block` (chunked) → candidate set =
 *    every address that ever *received* the token (a holder must have received).
 * 2. Read `balanceOf(addr)` at `blockTag: block` (batched multicall) → keep
 *    `balance >= minBalance`.
 *
 * Requires an **archive** node for the historical `balanceOf` (Alchemy free
 * tier qualifies). `client` must be a server-side PublicClient — never expose
 * its transport (RPC key) to the browser.
 */
export async function scanHolders(
  client: PublicClient,
  params: SnapshotParams,
  opts: ScanOptions = {},
): Promise<Holder[]> {
  const { token, block, minBalance, fromBlock = 0n } = params;
  const logChunk = opts.logChunk ?? 2000n;
  const balanceBatch = opts.balanceBatch ?? 500;

  // --- 1. candidate addresses from Transfer `to` (chunked log scan) ---
  const candidates = new Set<Address>();
  let processed = 0n;
  const span = block - fromBlock + 1n;
  for (let start = fromBlock; start <= block; start += logChunk) {
    const end = start + logChunk - 1n > block ? block : start + logChunk - 1n;
    const logs = await client.getLogs({
      address: token,
      event: transferEvent,
      fromBlock: start,
      toBlock: end,
    });
    for (const log of logs) {
      const to = log.args.to;
      if (to) candidates.add(getAddress(to));
    }
    processed += end - start + 1n;
    opts.onProgress?.({ phase: "logs", done: Number(processed), total: Number(span) });
    if (opts.maxCandidates && candidates.size > opts.maxCandidates) {
      throw new Error(
        `scanHolders: candidate set exceeded maxCandidates (${opts.maxCandidates}); narrow the range or raise the cap`,
      );
    }
  }

  // --- 2. balanceOf at the snapshot block (batched multicall) ---
  const list = [...candidates];
  const holders: Holder[] = [];
  for (let i = 0; i < list.length; i += balanceBatch) {
    const batch = list.slice(i, i + balanceBatch);
    const results = await client.multicall({
      blockNumber: block,
      allowFailure: true,
      contracts: batch.map((address) => ({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [address] as const,
      })),
    });
    results.forEach((r, j) => {
      if (r.status === "success") {
        const balance = r.result as bigint;
        if (balance > 0n && balance >= minBalance) {
          holders.push({ address: batch[j]!, balance });
        }
      }
    });
    opts.onProgress?.({ phase: "balances", done: Math.min(i + batch.length, list.length), total: list.length });
  }

  return holders;
}
