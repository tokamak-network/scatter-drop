import type { Address, PublicClient } from "viem";
import type { IdentityStatus } from "../types/index.js";
import { identityRegistryAbi, registryFactoryAbi } from "../core/abis.js";

/**
 * Pure check: is a `verifiedUntil` timestamp still valid at `nowSeconds`?
 * Mirrors the on-chain gate `verifiedUntil(account) >= block.timestamp`.
 * `0` means never verified.
 */
export function isVerificationValid(verifiedUntil: bigint, nowSeconds: bigint): boolean {
  return verifiedUntil > 0n && verifiedUntil >= nowSeconds;
}

/** Read `verifiedUntil(account)` from a zk-X509 IdentityRegistry. */
export async function getVerifiedUntil(
  client: PublicClient,
  registry: Address,
  account: Address,
): Promise<bigint> {
  const v = await client.readContract({
    address: registry,
    abi: identityRegistryAbi,
    functionName: "verifiedUntil",
    args: [account],
  });
  return BigInt(v);
}

/**
 * Evaluate the identity gate for `account` against `registry` at the chain's
 * latest block timestamp. Use before allowing claim/create in the UI.
 */
export async function getIdentityStatus(
  client: PublicClient,
  registry: Address,
  account: Address,
): Promise<IdentityStatus> {
  const [verifiedUntil, block] = await Promise.all([
    getVerifiedUntil(client, registry, account),
    client.getBlock(),
  ]);
  return {
    registry,
    account,
    verifiedUntil,
    isVerified: isVerificationValid(verifiedUntil, block.timestamp),
  };
}

/** Whether `registry` is a genuine registry deployed by the zk-X509 RegistryFactory. */
export async function isRegistry(
  client: PublicClient,
  factory: Address,
  registry: Address,
): Promise<boolean> {
  return client.readContract({
    address: factory,
    abi: registryFactoryAbi,
    functionName: "isRegistry",
    args: [registry],
  });
}
