"use client";

import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { useQuery } from "@tanstack/react-query";
import {
  dropFactoryAbi,
  identityRegistryAbi,
  merkleDropAbi,
  type AirdropType,
  type ScatterDropDeployment,
} from "@tokamak-network/scatter-drop-sdk";
import { fork } from "./wagmi";
import { fetchDeployment } from "./deployment";

/**
 * Human-readable reason the deployment is not usable, or null when it is.
 * Surfaces the loading state, a missing deployment, and (critically) a
 * deployment whose chainId does not match the configured fork chain — which
 * would otherwise make every read silently return nothing.
 */
export function deploymentIssue(
  dep: ScatterDropDeployment | null | undefined,
  loading: boolean,
): string | null {
  if (loading) return "Loading deployment…";
  if (!dep)
    return "No deployment configured. Start the dev fork and provide deployment.json (see apps/web/.env.local.example).";
  if (dep.chainId !== fork.id)
    return `Deployment chainId (${dep.chainId}) does not match the configured fork chain (${fork.id}). Set NEXT_PUBLIC_FORK_CHAIN_ID to match.`;
  return null;
}

/** Active deployment (DropFactory + fee token + treasury), runtime-loaded. */
export function useDeployment() {
  return useQuery({
    queryKey: ["deployment"],
    queryFn: fetchDeployment,
    staleTime: 60_000,
  });
}

/** DropFactory.feeOf(feeToken, type) — live creation fee (v2, 2D). */
export function useFeeOf(
  factory: Address | undefined,
  feeToken: Address | undefined,
  type: AirdropType,
) {
  return useReadContract({
    address: factory,
    abi: dropFactoryAbi,
    functionName: "feeOf",
    args: feeToken ? [feeToken, type] : undefined,
    chainId: fork.id,
    query: { enabled: !!factory && !!feeToken },
  });
}

/** DropFactory.tokenTier(token) — 0 NONE / 1 COMMUNITY / 2 OFFICIAL. */
export function useTokenTier(
  factory: Address | undefined,
  token: Address | undefined,
) {
  return useReadContract({
    address: factory,
    abi: dropFactoryAbi,
    functionName: "tokenTier",
    args: token ? [token] : undefined,
    chainId: fork.id,
    query: { enabled: !!factory && !!token },
  });
}

/** DropFactory.collectedFees(token) — live vault balance for a token. */
export function useCollectedFees(
  factory: Address | undefined,
  token: Address | undefined,
) {
  return useReadContract({
    address: factory,
    abi: dropFactoryAbi,
    functionName: "collectedFees",
    args: token ? [token] : undefined,
    chainId: fork.id,
    query: { enabled: !!factory && !!token },
  });
}

/** IdentityRegistry.verifiedUntil(account) — live identity gate timestamp. */
export function useVerifiedUntil(
  registry: Address | undefined,
  account: Address | undefined,
) {
  return useReadContract({
    address: registry,
    abi: identityRegistryAbi,
    functionName: "verifiedUntil",
    args: account ? [account] : undefined,
    chainId: fork.id,
    query: { enabled: !!registry && !!account },
  });
}

/** MerkleDrop.isClaimed(index) — live claimed flag for an allocation. */
export function useIsClaimed(drop: Address | undefined, index: number | undefined) {
  return useReadContract({
    address: drop,
    abi: merkleDropAbi,
    functionName: "isClaimed",
    args: index === undefined ? undefined : [BigInt(index)],
    chainId: fork.id,
    query: { enabled: !!drop && index !== undefined },
  });
}
