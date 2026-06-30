import type { Address, PublicClient } from "viem";
import type { CampaignInfo } from "../types/index.js";
import { merkleDropAbi } from "./abis.js";

export {
  merkleDropAbi,
  dropFactoryAbi,
  identityRegistryAbi,
  registryFactoryAbi,
  erc20Abi,
} from "./abis.js";

export {
  ZK_X509,
  getZkX509,
  parseDeployment,
  type ZkX509Addresses,
  type ScatterDropDeployment,
} from "./addresses.js";

/** Read the immutable on-chain config of a deployed MerkleDrop campaign. */
export async function getCampaignInfo(
  client: PublicClient,
  drop: Address,
): Promise<CampaignInfo> {
  const base = { address: drop, abi: merkleDropAbi } as const;
  const [token, merkleRoot, deadline, identityRegistry, operator] = await Promise.all([
    client.readContract({ ...base, functionName: "token" }),
    client.readContract({ ...base, functionName: "merkleRoot" }),
    client.readContract({ ...base, functionName: "deadline" }),
    client.readContract({ ...base, functionName: "identityRegistry" }),
    client.readContract({ ...base, functionName: "operator" }),
  ]);
  return { drop, token, merkleRoot, deadline: BigInt(deadline), identityRegistry, operator };
}

/** Whether the allocation at `index` has already been claimed. */
export async function isClaimed(
  client: PublicClient,
  drop: Address,
  index: bigint,
): Promise<boolean> {
  return client.readContract({
    address: drop,
    abi: merkleDropAbi,
    functionName: "isClaimed",
    args: [index],
  });
}
