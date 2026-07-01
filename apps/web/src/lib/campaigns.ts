"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import {
  erc20Abi,
  formatUnits,
  getAbiItem,
  isAddress,
  type Address,
  type PublicClient,
} from "viem";
import {
  AirdropType,
  dropFactoryAbi,
  getZkX509,
} from "@tokamak-network/scatter-drop-sdk";
import { fork } from "./wagmi";
import { useDeployment } from "./contracts";
import type { WebDeployment } from "./deployment";
import {
  getCampaign as getStubCampaign,
  listCampaigns as listStubCampaigns,
  type Campaign,
} from "./stub";

const DROP_CREATED = getAbiItem({ abi: dropFactoryAbi, name: "DropCreated" });

// Fallback window when the deployment json carries no deployBlock. The fork's
// local blocks (where the factory + campaigns live) sit at the chain head, so a
// bounded look-back keeps the scan on local blocks instead of forked history.
const LOOKBACK = 20_000n;

type DropCreatedArgs = {
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

function registryLabel(addr: Address, chainId: number): string {
  // W24: address(0) = no identity gate (open claim).
  if (/^0x0{40}$/i.test(addr)) return "Open claim (no identity gate)";
  const zk = getZkX509(chainId);
  const lc = addr.toLowerCase();
  if (zk && lc === zk.usersRegistry.toLowerCase()) return "Users registry";
  if (zk?.relayersRegistry && lc === zk.relayersRegistry.toLowerCase())
    return "Relayers registry";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Ask anvil for the block it forked at. Blocks at or below it are served by the
 * (often rate-limited, free-tier) upstream provider; only blocks above it are
 * local. Returns undefined on a non-anvil RPC (e.g. a real deployment).
 */
async function getForkBlock(client: PublicClient): Promise<bigint | undefined> {
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
 * Scan DropCreated logs on the fork from the deploy block (or a bounded
 * look-back). `filter` narrows by indexed args (e.g. a single drop address).
 */
async function scanDropCreated(
  client: PublicClient,
  dep: WebDeployment,
  filter?: { drop?: Address; operator?: Address },
): Promise<DropCreatedArgs[]> {
  const latest = await client.getBlockNumber();
  let fromBlock =
    dep.deployBlock ?? (latest > LOOKBACK ? latest - LOOKBACK : 0n);
  // Never scan below the fork block: campaigns are created on local blocks, and
  // reaching into pre-fork history makes anvil proxy `eth_getLogs` to the
  // upstream provider — whose free tier caps the range at ~10 blocks and errors
  // out, leaving the UI stuck on "Loading campaigns…". Flooring here keeps the
  // scan on local blocks (served by anvil, no range limit).
  const forkBlock = await getForkBlock(client);
  if (forkBlock !== undefined && fromBlock < forkBlock) fromBlock = forkBlock;
  // A stale deployBlock (different fork run) could exceed head → fromBlock > toBlock.
  if (fromBlock > latest) fromBlock = latest;
  const logs = await client.getLogs({
    address: dep.dropFactory,
    event: DROP_CREATED,
    ...(filter ? { args: filter } : {}),
    fromBlock,
    toBlock: latest,
  });
  return logs.map((l) => l.args as DropCreatedArgs);
}

type TokenMeta = { symbol: string; decimals: number };

/**
 * Resolve ERC-20 symbol + decimals for the campaign tokens so cards show the
 * real ticker (e.g. "WETH") and correctly-scaled amounts instead of a generic
 * "tokens" placeholder. Reads are best-effort — a token that doesn't answer
 * falls back to a neutral default.
 */
async function loadTokenMeta(
  client: PublicClient,
  tokens: Address[],
): Promise<Map<string, TokenMeta>> {
  const unique = [...new Set(tokens.map((t) => t.toLowerCase() as Address))];
  const entries = await Promise.all(
    unique.map(async (token) => {
      try {
        const [symbol, decimals] = await Promise.all([
          client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
          client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
        ]);
        return [token, { symbol: String(symbol), decimals: Number(decimals) }] as const;
      } catch {
        return [token, { symbol: "TOKEN", decimals: 18 }] as const;
      }
    }),
  );
  return new Map(entries);
}

/** Amount scaled by decimals, with thousands separators (max 4 dp). */
function formatAmount(raw: bigint, decimals: number): string {
  const n = Number(formatUnits(raw, decimals));
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 4 })
    : formatUnits(raw, decimals);
}

/**
 * A short, inviting one-liner derived from the on-chain type + token (no
 * off-chain metadata yet). Access (open vs gated) is shown separately on the
 * card, so the tagline focuses on what the drop is and why to click in.
 */
function taglineFor(type: AirdropType, symbol: string): string {
  switch (type) {
    case AirdropType.CSV:
      return `The list is locked in — see if your address made the cut and claim your ${symbol}.`;
    case AirdropType.ONCHAIN_SNAPSHOT:
      return `Held ${symbol} at the snapshot? Your reward is waiting — claim your share.`;
    case AirdropType.ONCHAIN_GATED:
      return `Verify once and claim your ${symbol} — reserved for real, eligible recipients.`;
    case AirdropType.SOCIAL:
      return `Finish a few tasks and earn ${symbol} — quick to complete.`;
    default:
      return `Check your eligibility and claim your ${symbol}.`;
  }
}

/** Map a DropCreated event into the UI Campaign shape (on-chain fields only). */
function toCampaign(
  args: DropCreatedArgs,
  chainId: number,
  meta?: TokenMeta,
): Campaign {
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const deadlineMs = Number(args.deadline) * 1000;
  const symbol = meta?.symbol ?? "TOKEN";
  const decimals = meta?.decimals ?? 18;
  const type = Number(args.airdropType) as AirdropType;
  return {
    id: args.drop,
    name: `${symbol} airdrop`,
    description: taglineFor(type, symbol),
    type: Number(args.airdropType) as AirdropType,
    drop: args.drop,
    token: args.airdropToken,
    tokenSymbol: symbol,
    totalAmount: `${formatAmount(args.totalAmount, decimals)} ${symbol}`,
    claimedPct: 0,
    // Guard against a uint64-max deadline overflowing JS's max date.
    deadline:
      deadlineMs <= 8.64e15
        ? new Date(deadlineMs).toISOString().slice(0, 10)
        : "No deadline",
    startTimeUnix: args.startTime,
    deadlineUnix: args.deadline,
    identityRegistry: args.identityRegistry,
    identityRegistryLabel: registryLabel(args.identityRegistry, chainId),
    operator: args.operator,
    status: args.deadline >= nowSeconds ? "active" : "ended",
  };
}

/**
 * Enumerate campaigns from DropFactory `DropCreated` logs on the fork. Falls
 * back to the stub list when no deployment is configured so Explore still
 * renders without a running fork. `live` reports which source was used.
 */
export function useCampaigns() {
  const client = usePublicClient({ chainId: fork.id });
  const { data: dep } = useDeployment();

  return useQuery({
    queryKey: ["campaigns", dep?.dropFactory],
    staleTime: 15_000,
    // Wait until the deployment resolves (null or object) to avoid a flash of
    // stub content before the live query key is known.
    enabled: dep !== undefined && !!client,
    queryFn: async (): Promise<{ live: boolean; campaigns: Campaign[] }> => {
      if (!client || !dep) {
        return { live: false, campaigns: await listStubCampaigns() };
      }
      const args = await scanDropCreated(client, dep);
      const meta = await loadTokenMeta(client, args.map((a) => a.airdropToken));
      return {
        live: true,
        campaigns: args.map((a) =>
          toCampaign(a, dep.chainId, meta.get(a.airdropToken.toLowerCase())),
        ),
      };
    },
  });
}

/** Campaigns created by `address` (DropCreated logs filtered by operator). */
export function useManagedCampaigns(address: Address | undefined) {
  const client = usePublicClient({ chainId: fork.id });
  const { data: dep } = useDeployment();

  return useQuery({
    queryKey: ["managedCampaigns", dep?.dropFactory, address],
    enabled: dep !== undefined && !!address && !!client,
    staleTime: 15_000,
    queryFn: async (): Promise<Campaign[]> => {
      if (!client || !dep || !address) return [];
      const args = await scanDropCreated(client, dep, { operator: address });
      const meta = await loadTokenMeta(client, args.map((a) => a.airdropToken));
      return args.map((a) =>
        toCampaign(a, dep.chainId, meta.get(a.airdropToken.toLowerCase())),
      );
    },
  });
}

/**
 * Resolve a single campaign. Address ids are read live from the matching
 * DropCreated log; numeric ids fall back to the stub (for browsing without a
 * fork).
 */
export function useCampaign(id: string) {
  const client = usePublicClient({ chainId: fork.id });
  const { data: dep } = useDeployment();

  return useQuery({
    queryKey: ["campaign", id, dep?.dropFactory],
    staleTime: 15_000,
    enabled: dep !== undefined && !!client,
    queryFn: async (): Promise<Campaign | undefined> => {
      if (isAddress(id) && client && dep) {
        const [args] = await scanDropCreated(client, dep, { drop: id as Address });
        if (!args) return undefined;
        const meta = await loadTokenMeta(client, [args.airdropToken]);
        return toCampaign(args, dep.chainId, meta.get(args.airdropToken.toLowerCase()));
      }
      return getStubCampaign(id);
    },
  });
}
