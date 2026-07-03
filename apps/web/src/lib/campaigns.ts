"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId, usePublicClient } from "wagmi";
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
  NATIVE_ETH,
} from "@tokamak-network/scatter-drop-sdk";
import { fetchCampaignMetas, type CampaignMetaEntry } from "./campaignMeta";
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
  // "No identity gate", not "open claim" — the recipient list still applies;
  // only the zk-X509 verification step is skipped.
  if (/^0x0{40}$/i.test(addr)) return "No identity gate";
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
      // Native ETH sentinel has no ERC-20 contract to read.
      if (token === NATIVE_ETH.toLowerCase()) {
        return [token, { symbol: "ETH", decimals: 18 }] as const;
      }
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

/**
 * User-facing symbol alias. Drops settle in WETH (an ERC-20, since the contracts
 * are ERC-20-only), but users think in ETH — so show "ETH" in the app. The real
 * token address stays visible on the detail page for disclosure.
 */
function displaySymbol(symbol: string): string {
  return symbol === "WETH" ? "ETH" : symbol;
}

/** Amount scaled by decimals, with thousands separators (max 4 dp). */
function formatAmount(raw: bigint, decimals: number): string {
  const n = Number(formatUnits(raw, decimals));
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 4 })
    : formatUnits(raw, decimals);
}

/**
 * Unix seconds → "YYYY-MM-DD HH:mm:ss" in the viewer's local timezone, so
 * campaign start/end times show the exact second the claim window flips
 * (matching the wizard's exact-time claim-window inputs).
 */
export function fmtUnixDateTime(unixSeconds: bigint | number): string {
  const d = new Date(Number(unixSeconds) * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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

/**
 * DropCreated events → UI Campaigns: resolve token symbols/decimals and the
 * operator-entered name/description (metadata store) in parallel, then map.
 * Pass `drop` when resolving a single campaign so only its meta row is fetched.
 */
async function enrichCampaigns(
  client: PublicClient,
  chainId: number,
  args: DropCreatedArgs[],
  drop?: Address,
): Promise<Campaign[]> {
  const [meta, metas] = await Promise.all([
    loadTokenMeta(client, args.map((a) => a.airdropToken)),
    fetchCampaignMetas(chainId, drop),
  ]);
  return args.map((a) =>
    toCampaign(a, chainId, meta.get(a.airdropToken.toLowerCase()), metas[a.drop.toLowerCase()]),
  );
}

/**
 * Map a DropCreated event into the UI Campaign shape. On-chain fields, plus
 * the operator-entered name/description from the metadata store when present
 * (the event doesn't carry them; the generic "<SYMBOL> airdrop" is a fallback).
 */
function toCampaign(
  args: DropCreatedArgs,
  chainId: number,
  meta?: TokenMeta,
  cm?: CampaignMetaEntry,
): Campaign {
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const deadlineMs = Number(args.deadline) * 1000;
  const symbol = displaySymbol(meta?.symbol ?? "TOKEN");
  const decimals = meta?.decimals ?? 18;
  const type = Number(args.airdropType) as AirdropType;
  return {
    id: args.drop,
    name: cm?.name ?? `${symbol} airdrop`,
    description: cm?.description ?? taglineFor(type, symbol),
    type: Number(args.airdropType) as AirdropType,
    drop: args.drop,
    token: args.airdropToken,
    tokenSymbol: symbol,
    totalAmount: `${formatAmount(args.totalAmount, decimals)} ${symbol}`,
    totalRaw: args.totalAmount,
    decimals,
    claimedPct: 0,
    // Guard against a uint64-max deadline overflowing JS's max date.
    deadline:
      deadlineMs <= 8.64e15 ? fmtUnixDateTime(args.deadline) : "No deadline",
    startTimeUnix: args.startTime,
    deadlineUnix: args.deadline,
    identityRegistry: args.identityRegistry,
    identityRegistryLabel: registryLabel(args.identityRegistry, chainId),
    merkleRoot: args.merkleRoot,
    operator: args.operator,
    status: args.deadline >= nowSeconds ? "active" : "ended",
  };
}

// MerkleDrop.Claimed — every airdrop type deploys a MerkleDrop, so counting
// these logs works uniformly (CSV, snapshot, gated, social). Not in the SDK's
// minimal ABI, so declared here.
const CLAIMED_EVENT = {
  type: "event",
  name: "Claimed",
  inputs: [
    { name: "index", type: "uint256", indexed: true },
    { name: "account", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
  ],
} as const;

export type CampaignStats = {
  /** Number of claims made (Claimed events). */
  claimedCount: number;
  /** Distributed amount, formatted with symbol. */
  distributed: string;
  /** Tokens still held by the drop contract, formatted with symbol. */
  remaining: string;
  /** Distributed as a percentage of the pool (0–100). */
  pct: number;
};

/**
 * Live distribution stats for one campaign — claims made, amount distributed,
 * and funds remaining. Works for any airdrop type (all are MerkleDrop): sums
 * `Claimed` logs and reads the drop's token balance. The recipient *count*
 * (Merkle leaf total) is off-chain, so only claims-so-far are shown.
 */
export function useCampaignStats(campaign?: Campaign) {
  const chainId = useChainId();
  const client = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["campaignStats", chainId, campaign?.drop],
    enabled: !!client && !!campaign?.drop && campaign.totalRaw !== undefined,
    staleTime: 15_000,
    queryFn: async (): Promise<CampaignStats | null> => {
      if (!client || !campaign?.totalRaw) return null;
      const decimals = campaign.decimals ?? 18;
      const total = campaign.totalRaw;
      const latest = await client.getBlockNumber();
      const forkBlock = await getForkBlock(client);
      let fromBlock = forkBlock ?? (latest > LOOKBACK ? latest - LOOKBACK : 0n);
      if (fromBlock > latest) fromBlock = latest;

      const [balance, logs] = await Promise.all([
        client.readContract({
          address: campaign.token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [campaign.drop],
        }) as Promise<bigint>,
        client.getLogs({
          address: campaign.drop,
          event: CLAIMED_EVENT,
          fromBlock,
          toBlock: latest,
        }),
      ]);

      const distributed = logs.reduce(
        (sum, l) => sum + ((l.args as { amount?: bigint }).amount ?? 0n),
        0n,
      );
      const pct = total > 0n ? Number((distributed * 10000n) / total) / 100 : 0;
      return {
        claimedCount: logs.length,
        distributed: `${formatAmount(distributed, decimals)} ${campaign.tokenSymbol}`,
        remaining: `${formatAmount(balance, decimals)} ${campaign.tokenSymbol}`,
        pct,
      };
    },
  });
}

/**
 * Enumerate campaigns from DropFactory `DropCreated` logs on the fork. Falls
 * back to the stub list when no deployment is configured so Explore still
 * renders without a running fork. `live` reports which source was used.
 */
export function useCampaigns() {
  const chainId = useChainId();
  const client = usePublicClient({ chainId });
  const { data: dep } = useDeployment();

  return useQuery({
    queryKey: ["campaigns", chainId, dep?.dropFactory],
    staleTime: 15_000,
    // Wait until the deployment resolves (null or object) to avoid a flash of
    // stub content before the live query key is known.
    enabled: dep !== undefined && !!client,
    queryFn: async (): Promise<{ live: boolean; campaigns: Campaign[] }> => {
      if (!client || !dep) {
        return { live: false, campaigns: await listStubCampaigns() };
      }
      const args = await scanDropCreated(client, dep);
      return { live: true, campaigns: await enrichCampaigns(client, dep.chainId, args) };
    },
  });
}

/** Campaigns created by `address` (DropCreated logs filtered by operator). */
export function useManagedCampaigns(address: Address | undefined) {
  const chainId = useChainId();
  const client = usePublicClient({ chainId });
  const { data: dep } = useDeployment();

  return useQuery({
    queryKey: ["managedCampaigns", chainId, dep?.dropFactory, address],
    enabled: dep !== undefined && !!address && !!client,
    staleTime: 15_000,
    queryFn: async (): Promise<Campaign[]> => {
      if (!client || !dep || !address) return [];
      const args = await scanDropCreated(client, dep, { operator: address });
      return enrichCampaigns(client, dep.chainId, args);
    },
  });
}

/**
 * Resolve a single campaign. Address ids are read live from the matching
 * DropCreated log; numeric ids fall back to the stub (for browsing without a
 * fork).
 */
export function useCampaign(id: string) {
  const chainId = useChainId();
  const client = usePublicClient({ chainId });
  const { data: dep } = useDeployment();

  return useQuery({
    queryKey: ["campaign", chainId, id, dep?.dropFactory],
    staleTime: 15_000,
    enabled: dep !== undefined && !!client,
    queryFn: async (): Promise<Campaign | undefined> => {
      if (isAddress(id) && client && dep) {
        const [args] = await scanDropCreated(client, dep, { drop: id as Address });
        if (!args) return undefined;
        const [campaign] = await enrichCampaigns(client, dep.chainId, [args], args.drop);
        return campaign;
      }
      return getStubCampaign(id);
    },
  });
}

const ALLOWED_TOKEN_SET = getAbiItem({
  abi: dropFactoryAbi,
  name: "AllowedTokenSet",
});

export type AllowedToken = { token: Address; symbol: string };

/**
 * Current allow-list, reconstructed from `AllowedTokenSet` logs (last event per
 * token wins). Lets the admin see what's curated instead of probing addresses
 * one at a time. Symbols are resolved for display.
 */
export function useAllowedTokens() {
  const chainId = useChainId();
  const client = usePublicClient({ chainId });
  const { data: dep } = useDeployment();

  return useQuery({
    queryKey: ["allowedTokens", chainId, dep?.dropFactory],
    enabled: !!client && !!dep?.dropFactory,
    staleTime: 15_000,
    queryFn: async (): Promise<AllowedToken[]> => {
      if (!client || !dep?.dropFactory) return [];
      const latest = await client.getBlockNumber();
      const forkBlock = await getForkBlock(client);
      let fromBlock = forkBlock ?? (latest > LOOKBACK ? latest - LOOKBACK : 0n);
      if (fromBlock > latest) fromBlock = latest;

      const logs = await client.getLogs({
        address: dep.dropFactory,
        event: ALLOWED_TOKEN_SET,
        fromBlock,
        toBlock: latest,
      });
      // Logs are block-ordered, so the last entry per token is its current state.
      const state = new Map<string, boolean>();
      for (const l of logs) {
        const a = l.args as { token?: Address; allowed?: boolean };
        if (a.token) state.set(a.token.toLowerCase(), !!a.allowed);
      }
      const allowed = [...state.entries()]
        .filter(([, v]) => v)
        .map(([t]) => t as Address);
      const meta = await loadTokenMeta(client, allowed);
      return allowed.map((token) => ({
        token,
        symbol: meta.get(token.toLowerCase())?.symbol ?? "TOKEN",
      }));
    },
  });
}
