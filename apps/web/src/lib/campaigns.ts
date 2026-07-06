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
import { useDeployment, type ChainOpt } from "./contracts";
import { scanDropCreated, scanWindow, type DropCreatedArgs } from "./dropScan";
import {
  getCampaign as getStubCampaign,
  listCampaigns as listStubCampaigns,
  type Campaign,
} from "./stub";

function registryLabel(addr: Address, chainId: number): string {
  // W24: address(0) = no identity gate. Labeled "No identity gate", not
  // "open claim" — the recipient list still applies; only the zk-X509
  // verification step is skipped.
  if (/^0x0{40}$/i.test(addr)) return "No identity gate";
  const zk = getZkX509(chainId);
  const lc = addr.toLowerCase();
  if (zk && lc === zk.usersRegistry.toLowerCase()) return "Users registry";
  if (zk?.relayersRegistry && lc === zk.relayersRegistry.toLowerCase())
    return "Relayers registry";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
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
 * "YYYY-MM-DD HH:mm[:ss]" in the viewer's local timezone — the app's one
 * datetime layout. `seconds` for exact on-chain times (claim windows flip on
 * the second); omit it for fuzzy times like announced windows.
 */
export function fmtDateTime(d: Date, { seconds = true } = {}): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}${seconds ? `:${p(d.getSeconds())}` : ""}`
  );
}

/**
 * Unix seconds → "YYYY-MM-DD HH:mm:ss" in the viewer's local timezone, so
 * campaign start/end times show the exact second the claim window flips
 * (matching the wizard's exact-time claim-window inputs).
 */
export function fmtUnixDateTime(unixSeconds: bigint | number): string {
  return fmtDateTime(new Date(Number(unixSeconds) * 1000));
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
    creationTx: args.txHash,
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
export function useCampaignStats(campaign?: Campaign, opts?: ChainOpt) {
  const walletChainId = useChainId();
  const chainId = opts?.chainId ?? walletChainId;
  // Undefined for a chain wagmi has no transport for (unregistered network) —
  // `enabled` then keeps the query off instead of reading the wrong chain.
  const client = usePublicClient({ chainId });
  // deployBlock floors the scan at the factory's deployment — without it the
  // default LOOKBACK window (20k blocks) silently drops older history on
  // long-lived networks.
  const { data: dep } = useDeployment(opts);

  return useQuery({
    queryKey: ["campaignStats", chainId, campaign?.drop],
    enabled: !!client && !!campaign?.drop && campaign.totalRaw !== undefined && dep !== undefined,
    staleTime: 15_000,
    queryFn: async (): Promise<CampaignStats | null> => {
      if (!client || !campaign?.totalRaw) return null;
      const decimals = campaign.decimals ?? 18;
      const total = campaign.totalRaw;
      const { fromBlock, toBlock } = await scanWindow(client, {
        deployBlock: dep?.deployBlock,
      });

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
          toBlock,
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

// Timestamp-resolution bounds for useClaimEvents: fetch block times only for
// campaigns whose claims span a manageable number of blocks, in small batches.
const MAX_TIMESTAMP_BLOCKS = 500;
const TIMESTAMP_BATCH = 20;

export type ClaimEvent = {
  account: Address;
  amount: bigint;
  txHash: `0x${string}`;
  /** Unix seconds of the claim's block; 0 = not resolved (too many blocks). */
  timestamp: number;
};

/**
 * Every Claimed event for a campaign with block timestamps — feeds the
 * operator's distribution report (one row per claim: who, how much, when,
 * which tx). Timestamps come from one getBlock per unique block.
 */
export function useClaimEvents(campaign?: Campaign, opts?: ChainOpt) {
  const walletChainId = useChainId();
  const chainId = opts?.chainId ?? walletChainId;
  const client = usePublicClient({ chainId });
  // deployBlock floors the scan (see useCampaignStats) — campaigns older than
  // the LOOKBACK window would otherwise silently lose their claim history.
  const { data: dep } = useDeployment(opts);

  return useQuery({
    queryKey: ["claimEvents", chainId, campaign?.drop],
    enabled: !!client && !!campaign?.drop && dep !== undefined,
    staleTime: 15_000,
    queryFn: async (): Promise<ClaimEvent[]> => {
      if (!client || !campaign) return [];
      const { fromBlock, toBlock } = await scanWindow(client, {
        deployBlock: dep?.deployBlock,
      });
      const logs = await client.getLogs({
        address: campaign.drop,
        event: CLAIMED_EVENT,
        fromBlock,
        toBlock,
      });
      // One getBlock per unique block, capped: claims usually batch into few
      // blocks, but a worst-case 1-claim-per-block campaign would otherwise
      // fan out thousands of RPC calls. Past the cap, timestamps are omitted
      // (0 → rendered as "—") rather than hammering the provider.
      const uniqueBlocks = [...new Set(logs.map((l) => l.blockNumber))];
      const times = new Map<bigint, number>();
      if (uniqueBlocks.length <= MAX_TIMESTAMP_BLOCKS) {
        for (let i = 0; i < uniqueBlocks.length; i += TIMESTAMP_BATCH) {
          const batch = uniqueBlocks.slice(i, i + TIMESTAMP_BATCH);
          const blocks = await Promise.all(
            batch.map((bn) => client.getBlock({ blockNumber: bn })),
          );
          blocks.forEach((b, j) => times.set(batch[j]!, Number(b.timestamp)));
        }
      }
      return logs.map((l) => {
        const args = l.args as { account?: Address; amount?: bigint };
        // Fail fast on a malformed log — a fabricated "0x" account would
        // silently corrupt downstream joins while type-checking as Address.
        if (!args.account) throw new Error("Malformed Claimed log (no account)");
        return {
          account: args.account.toLowerCase() as Address,
          amount: args.amount ?? 0n,
          txHash: l.transactionHash,
          timestamp: times.get(l.blockNumber) ?? 0,
        };
      });
    },
  });
}

/**
 * Enumerate campaigns from DropFactory `DropCreated` logs on the fork. Falls
 * back to the stub list when no deployment is configured so Explore still
 * renders without a running fork. `live` reports which source was used.
 */
export function useCampaigns(opts?: ChainOpt) {
  const walletChainId = useChainId();
  const chainId = opts?.chainId ?? walletChainId;
  const client = usePublicClient({ chainId });
  const { data: dep } = useDeployment(opts);

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
export function useCampaign(id: string, opts?: ChainOpt) {
  const walletChainId = useChainId();
  const chainId = opts?.chainId ?? walletChainId;
  const client = usePublicClient({ chainId });
  const { data: dep } = useDeployment(opts);

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
      // deployBlock floors the scan — allow-list entries set before the
      // LOOKBACK window would otherwise vanish from the list.
      const { fromBlock, toBlock } = await scanWindow(client, {
        deployBlock: dep.deployBlock,
      });

      const logs = await client.getLogs({
        address: dep.dropFactory,
        event: ALLOWED_TOKEN_SET,
        fromBlock,
        toBlock,
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
