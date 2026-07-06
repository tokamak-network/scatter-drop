import {
  decodeEventLog,
  getAbiItem,
  type Address,
  type Log,
  type PublicClient,
} from "viem";
import { dropFactoryAbi } from "@tokamak-network/scatter-drop-sdk";

/**
 * Shared DropCreated log-scan machinery — isomorphic (viem only, no wagmi /
 * react / server imports) so both the client campaign reads (lib/campaigns)
 * and the server-side link verification (lib/server/dropVerify) use one copy
 * of the subtle fork-floor logic.
 */

export const DROP_CREATED = getAbiItem({ abi: dropFactoryAbi, name: "DropCreated" });
export const PROOFS_PUBLISHED = getAbiItem({ abi: dropFactoryAbi, name: "ProofsPublished" });

// Fallback window when the source carries no deployBlock. The fork's local
// blocks (where the factory + campaigns live) sit at the chain head, so a
// bounded look-back keeps the scan on local blocks instead of forked history.
export const LOOKBACK = 20_000n;

export type DropCreatedArgs = {
  drop: Address;
  operator: Address;
  airdropType: number;
  airdropToken: Address;
  identityRegistry: Address;
  merkleRoot: `0x${string}`;
  totalAmount: bigint;
  startTime: bigint;
  deadline: bigint;
  fee: bigint;
  /**
   * Creation (createDrop) transaction hash — not an event arg; attached from
   * the log by the scanners so the UI can link the campaign's origin tx.
   * Absent on pending logs (viem types transactionHash as nullable).
   */
  txHash?: `0x${string}`;
};

/** Attach the log's transactionHash to the decoded args (single home for the
    nullable→optional normalization — viem types pending logs' hash as null). */
const withTxHash = (
  args: DropCreatedArgs,
  log: { transactionHash: `0x${string}` | null },
): DropCreatedArgs => ({ ...args, txHash: log.transactionHash ?? undefined });

/**
 * The DropCreated args from `logs` (e.g. a creation receipt's), considering
 * only logs emitted by `factory` — another contract in the same tx could emit
 * a signature-compatible event. Returns the first match, or null.
 */
export function findDropCreated(
  logs: readonly Log[],
  factory: Address,
): DropCreatedArgs | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({
        abi: dropFactoryAbi,
        data: log.data,
        topics: log.topics,
      });
      if (ev.eventName === "DropCreated") {
        return withTxHash(ev.args as unknown as DropCreatedArgs, log);
      }
    } catch {
      /* not a DropCreated log — keep scanning */
    }
  }
  return null;
}

/**
 * Ask anvil for the block it forked at. Blocks at or below it are served by the
 * (often rate-limited, free-tier) upstream provider; only blocks above it are
 * local. Returns undefined on a non-anvil RPC (e.g. a real deployment).
 */
export async function getForkBlock(client: PublicClient): Promise<bigint | undefined> {
  try {
    const info = (await client.request({
      method: "anvil_nodeInfo",
    } as never)) as { forkConfig?: { forkBlockNumber?: number } } | null;
    const fb = info?.forkConfig?.forkBlockNumber;
    return typeof fb === "number" ? BigInt(fb) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Scan DropCreated logs from the deploy block (or a bounded look-back).
 * `filter` narrows by indexed args (e.g. a single drop address).
 *
 * Never scans below the fork block: campaigns are created on local blocks, and
 * reaching into pre-fork history makes anvil proxy `eth_getLogs` to the
 * upstream provider — whose free tier caps the range at ~10 blocks and errors
 * out. Flooring here keeps the scan on local blocks (no range limit).
 */
export async function scanDropCreated(
  client: PublicClient,
  source: { dropFactory: Address; deployBlock?: bigint },
  filter?: { drop?: Address; operator?: Address },
): Promise<DropCreatedArgs[]> {
  const { fromBlock, toBlock } = await scanWindow(client, source);
  const logs = await getLogsChunked(client, {
    address: source.dropFactory,
    event: DROP_CREATED,
    ...(filter ? { args: filter } : {}),
    fromBlock,
    toBlock,
  });
  return logs.map((l) => withTxHash(l.args as DropCreatedArgs, l));
}

/**
 * The latest ProofsPublished CID for `drop` (the current proofs.json anchor),
 * or null when the operator never published one. Same fork-floor rules; when
 * the single-range read hits a provider range cap, falls back to scanning
 * newest-first chunks and early-exits on the first (most recent) hit.
 */
export async function scanLatestProofsCid(
  client: PublicClient,
  source: { dropFactory: Address; deployBlock?: bigint },
  drop: Address,
): Promise<string | null> {
  const { fromBlock, toBlock } = await scanWindow(client, source);
  const params = {
    address: source.dropFactory,
    event: PROOFS_PUBLISHED,
    args: { drop },
  } as const;
  try {
    const logs = await client.getLogs({ ...params, fromBlock, toBlock });
    return latestCid(logs);
  } catch {
    // Range-capped provider: walk back from the head one chunk at a time —
    // we only want the LATEST event, so the first non-empty chunk wins.
    for (let hi = toBlock; hi >= fromBlock; hi -= CHUNK) {
      const lo = hi - CHUNK + 1n > fromBlock ? hi - CHUNK + 1n : fromBlock;
      const logs = await client.getLogs({ ...params, fromBlock: lo, toBlock: hi });
      const cid = latestCid(logs);
      if (cid !== null) return cid;
      if (lo === fromBlock) break;
    }
    return null;
  }
}

function latestCid(logs: { args: unknown }[]): string | null {
  const last = logs.at(-1);
  if (!last || typeof last.args !== "object" || last.args === null) return null;
  const cid = (last.args as { cid?: unknown }).cid;
  return typeof cid === "string" ? cid : null;
}

// Chunk size for range-capped fallbacks — well under common provider caps
// (10k–100k blocks) while keeping the number of round-trips sane.
const CHUNK = 9_000n;

type ScannedLog = { args: unknown; transactionHash: `0x${string}` | null };

/**
 * getLogs with a chunked fallback: try the whole window in one call (fast
 * path — anvil and paid RPCs take any range), and only on failure re-scan in
 * CHUNK-sized slices, oldest-first, concatenating results. Throws only when a
 * chunked slice itself fails (a real provider error, not a range cap).
 */
async function getLogsChunked(
  client: PublicClient,
  params: { fromBlock: bigint; toBlock: bigint } & Record<string, unknown>,
): Promise<ScannedLog[]> {
  try {
    return (await client.getLogs(params as never)) as unknown as ScannedLog[];
  } catch {
    const out: ScannedLog[] = [];
    for (let lo = params.fromBlock; lo <= params.toBlock; lo += CHUNK) {
      const hi = lo + CHUNK - 1n < params.toBlock ? lo + CHUNK - 1n : params.toBlock;
      const slice = (await client.getLogs({
        ...params,
        fromBlock: lo,
        toBlock: hi,
      } as never)) as unknown as ScannedLog[];
      out.push(...slice);
    }
    return out;
  }
}

/**
 * Fork-floored [fromBlock, toBlock] window for log scans. Address-agnostic —
 * shared by the factory-log scans here and the drop-scoped read hooks in
 * lib/campaigns (pass {} for the default LOOKBACK window).
 */
export async function scanWindow(
  client: PublicClient,
  source: { deployBlock?: bigint },
): Promise<{ fromBlock: bigint; toBlock: bigint }> {
  const [latest, forkBlock] = await Promise.all([
    client.getBlockNumber(),
    getForkBlock(client),
  ]);
  let fromBlock =
    source.deployBlock ?? (latest > LOOKBACK ? latest - LOOKBACK : 0n);
  if (forkBlock !== undefined && fromBlock < forkBlock) fromBlock = forkBlock;
  // A stale deployBlock (different fork run) could exceed head → fromBlock > toBlock.
  if (fromBlock > latest) fromBlock = latest;
  return { fromBlock, toBlock: latest };
}
