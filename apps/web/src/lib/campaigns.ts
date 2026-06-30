"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import {
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
  deadline: bigint;
  fee: bigint;
};

function registryLabel(addr: Address, chainId: number): string {
  const zk = getZkX509(chainId);
  const lc = addr.toLowerCase();
  if (zk && lc === zk.usersRegistry.toLowerCase()) return "Users registry";
  if (zk?.relayersRegistry && lc === zk.relayersRegistry.toLowerCase())
    return "Relayers registry";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Scan DropCreated logs on the fork from the deploy block (or a bounded
 * look-back). `filter` narrows by indexed args (e.g. a single drop address).
 */
async function scanDropCreated(
  client: PublicClient,
  dep: WebDeployment,
  filter?: { drop: Address },
): Promise<DropCreatedArgs[]> {
  const latest = await client.getBlockNumber();
  const fromBlock =
    dep.deployBlock ?? (latest > LOOKBACK ? latest - LOOKBACK : 0n);
  const logs = await client.getLogs({
    address: dep.dropFactory,
    event: DROP_CREATED,
    ...(filter ? { args: filter } : {}),
    fromBlock,
    toBlock: latest,
  });
  return logs.map((l) => l.args as DropCreatedArgs);
}

/** Map a DropCreated event into the UI Campaign shape (on-chain fields only). */
function toCampaign(args: DropCreatedArgs, chainId: number): Campaign {
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  return {
    id: args.drop,
    name: `Campaign ${args.drop.slice(0, 8)}`,
    description: `Created by ${args.operator.slice(0, 10)}…`,
    type: Number(args.airdropType) as AirdropType,
    drop: args.drop,
    token: args.airdropToken,
    tokenSymbol: "tokens",
    totalAmount: `${formatUnits(args.totalAmount, 18)} tokens`,
    claimedPct: 0,
    deadline: new Date(Number(args.deadline) * 1000).toISOString().slice(0, 10),
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
    queryFn: async (): Promise<{ live: boolean; campaigns: Campaign[] }> => {
      if (!client || !dep) {
        return { live: false, campaigns: await listStubCampaigns() };
      }
      const args = await scanDropCreated(client, dep);
      return { live: true, campaigns: args.map((a) => toCampaign(a, dep.chainId)) };
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
    queryFn: async (): Promise<Campaign | undefined> => {
      if (isAddress(id) && client && dep) {
        const [args] = await scanDropCreated(client, dep, { drop: id as Address });
        return args ? toCampaign(args, dep.chainId) : undefined;
      }
      return getStubCampaign(id);
    },
  });
}
