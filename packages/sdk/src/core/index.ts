import type { Address, PublicClient } from "viem";
import { TokenTier, type CampaignInfo } from "../types/index.js";
import { dropFactoryAbi, merkleDropAbi } from "./abis.js";

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
  const [token, merkleRoot, startTime, deadline, identityRegistry, operator] = await Promise.all([
    client.readContract({ ...base, functionName: "token" }),
    client.readContract({ ...base, functionName: "merkleRoot" }),
    client.readContract({ ...base, functionName: "startTime" }),
    client.readContract({ ...base, functionName: "deadline" }),
    client.readContract({ ...base, functionName: "identityRegistry" }),
    client.readContract({ ...base, functionName: "operator" }),
  ]);
  return {
    drop,
    token,
    merkleRoot,
    startTime: BigInt(startTime),
    deadline: BigInt(deadline),
    identityRegistry,
    operator,
  };
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

/** Read a token's registry tier from the DropFactory (NONE/COMMUNITY/OFFICIAL). */
export async function getTokenTier(
  client: PublicClient,
  factory: Address,
  token: Address,
): Promise<TokenTier> {
  const t = await client.readContract({
    address: factory,
    abi: dropFactoryAbi,
    functionName: "tokenTier",
    args: [token],
  });
  const n = Number(t);
  if (n !== TokenTier.NONE && n !== TokenTier.COMMUNITY && n !== TokenTier.OFFICIAL) {
    throw new Error(`Unexpected TokenTier ordinal from contract: ${n}`);
  }
  return n;
}

/**
 * Read the creation fee for a (feeToken, airdropType) pair.
 * `feeToken = address(0)` is the ETH price. Returns 0 when that token isn't
 * configured for the type (i.e. not an accepted payment option).
 */
export async function getFeeOf(
  client: PublicClient,
  factory: Address,
  feeToken: Address,
  airdropType: number,
): Promise<bigint> {
  return client.readContract({
    address: factory,
    abi: dropFactoryAbi,
    functionName: "feeOf",
    args: [feeToken, airdropType],
  });
}

/** Whether a token may be used for airdrops (tier != NONE). */
export async function isTokenAllowed(
  client: PublicClient,
  factory: Address,
  token: Address,
): Promise<boolean> {
  return client.readContract({
    address: factory,
    abi: dropFactoryAbi,
    functionName: "isAllowed",
    args: [token],
  });
}
