import { getAbiItem, type Address, type PublicClient } from "viem";
import { dropFactoryAbi } from "@tokamak-network/scatter-drop-sdk";

/**
 * Shared DropCreated log-scan machinery — isomorphic (viem only, no wagmi /
 * react / server imports) so both the client campaign reads (lib/campaigns)
 * and the server-side link verification (lib/server/dropVerify) use one copy
 * of the subtle fork-floor logic.
 */

export const DROP_CREATED = getAbiItem({ abi: dropFactoryAbi, name: "DropCreated" });

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
};

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
  const [latest, forkBlock] = await Promise.all([
    client.getBlockNumber(),
    getForkBlock(client),
  ]);
  let fromBlock =
    source.deployBlock ?? (latest > LOOKBACK ? latest - LOOKBACK : 0n);
  if (forkBlock !== undefined && fromBlock < forkBlock) fromBlock = forkBlock;
  // A stale deployBlock (different fork run) could exceed head → fromBlock > toBlock.
  if (fromBlock > latest) fromBlock = latest;
  const logs = await client.getLogs({
    address: source.dropFactory,
    event: DROP_CREATED,
    ...(filter ? { args: filter } : {}),
    fromBlock,
    toBlock: latest,
  });
  return logs.map((l) => l.args as DropCreatedArgs);
}
