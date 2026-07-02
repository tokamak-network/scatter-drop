"use client";

import { useChainId, useReadContract } from "wagmi";
import type { Address } from "viem";
import { useQuery } from "@tanstack/react-query";
import {
  dropFactoryAbi,
  identityRegistryAbi,
  merkleDropAbi,
  type ScatterDropDeployment,
} from "@tokamak-network/scatter-drop-sdk";
import { resolveDeployment } from "./deployment";

/**
 * Human-readable reason the deployment is not usable, or null when it is.
 * The deployment is now resolved for the active chain from the network registry,
 * so a chainId mismatch can't happen here (reads target the same chain).
 */
export function deploymentIssue(
  dep: ScatterDropDeployment | null | undefined,
  loading: boolean,
): string | null {
  if (loading) return "Loading deployment…";
  if (!dep)
    return "No deployment configured for this network. Ask the platform admin to register it (Admin → Networks), or start the dev fork.";
  return null;
}

const ownableAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

/**
 * Live admin gate: the connected wallet is the DropFactory owner. Reads the
 * on-chain `owner()` (Ownable; minimal ABI, since the SDK ABI omits it) so a
 * transferred owner / multisig is honored, falling back to the deployment's
 * `deployer` only if the read is unavailable.
 */
export function useIsAdmin(address: Address | undefined): boolean {
  const { data: dep } = useDeployment();
  const { data: owner } = useReadContract({
    address: dep?.dropFactory,
    abi: ownableAbi,
    functionName: "owner",
    chainId: useChainId(),
    query: { enabled: !!dep?.dropFactory },
  });
  const admin = owner ?? dep?.deployer;
  return !!address && !!admin && admin.toLowerCase() === address.toLowerCase();
}

/** Active deployment for the connected chain, resolved from the network registry. */
export function useDeployment() {
  const chainId = useChainId();
  return useQuery({
    queryKey: ["deployment", chainId],
    queryFn: () => resolveDeployment(chainId),
    staleTime: 60_000,
  });
}

// feeModeOf/feeBpsOf are public views on DropFactory but omitted from the SDK
// abi (which exposes the computed feeOf + defaults); read them with a minimal abi.
const feeConfigAbi = [
  {
    type: "function",
    name: "feeModeOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "feeBpsOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint16" }],
  },
] as const;

/** DropFactory.feeOf(token, totalAmount) — computed creation fee (W22, % or flat). */
export function useComputedFee(
  factory: Address | undefined,
  token: Address | undefined,
  totalAmount: bigint,
) {
  return useReadContract({
    address: factory,
    abi: dropFactoryAbi,
    functionName: "feeOf",
    args: token ? [token, totalAmount] : undefined,
    chainId: useChainId(),
    query: { enabled: !!factory && !!token && totalAmount > 0n },
  });
}

/** DropFactory.feeModeOf(token) — 0 PERCENT / 1 FLAT (default-aware). */
export function useFeeModeOf(
  factory: Address | undefined,
  token: Address | undefined,
) {
  return useReadContract({
    address: factory,
    abi: feeConfigAbi,
    functionName: "feeModeOf",
    args: token ? [token] : undefined,
    chainId: useChainId(),
    query: { enabled: !!factory && !!token },
  });
}

/** DropFactory.feeBpsOf(token) — percent rate in bps (default-aware). */
export function useFeeBpsOf(
  factory: Address | undefined,
  token: Address | undefined,
) {
  return useReadContract({
    address: factory,
    abi: feeConfigAbi,
    functionName: "feeBpsOf",
    args: token ? [token] : undefined,
    chainId: useChainId(),
    query: { enabled: !!factory && !!token },
  });
}

/** DropFactory.flatFee(token) — flat fee amount (base units). */
export function useFlatFee(
  factory: Address | undefined,
  token: Address | undefined,
) {
  return useReadContract({
    address: factory,
    abi: dropFactoryAbi,
    functionName: "flatFee",
    args: token ? [token] : undefined,
    chainId: useChainId(),
    query: { enabled: !!factory && !!token },
  });
}

/** DropFactory.defaultFeeMode() — platform default fee mode. */
export function useDefaultFeeMode(factory: Address | undefined) {
  return useReadContract({
    address: factory,
    abi: dropFactoryAbi,
    functionName: "defaultFeeMode",
    chainId: useChainId(),
    query: { enabled: !!factory },
  });
}

/** DropFactory.defaultFeeBps() — platform default percent rate (bps). */
export function useDefaultFeeBps(factory: Address | undefined) {
  return useReadContract({
    address: factory,
    abi: dropFactoryAbi,
    functionName: "defaultFeeBps",
    chainId: useChainId(),
    query: { enabled: !!factory },
  });
}

const erc20DecimalsAbi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

/** ERC20.decimals() for an address (the SDK erc20Abi omits it). */
export function useErc20Decimals(token: Address | undefined) {
  return useReadContract({
    address: token,
    abi: erc20DecimalsAbi,
    functionName: "decimals",
    chainId: useChainId(),
    query: { enabled: !!token },
  });
}

const erc20SymbolAbi = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

/** ERC20.symbol() for an address — for human-readable amount labels. */
export function useErc20Symbol(token: Address | undefined) {
  return useReadContract({
    address: token,
    abi: erc20SymbolAbi,
    functionName: "symbol",
    chainId: useChainId(),
    query: { enabled: !!token },
  });
}

const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** ERC20.balanceOf(account) — for checking the operator can fund the drop. */
export function useErc20Balance(token: Address | undefined, account: Address | undefined) {
  return useReadContract({
    address: token,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    chainId: useChainId(),
    query: { enabled: !!token && !!account },
  });
}

/** DropFactory.tokenTier(token) — 0 NONE / 1 ALLOWED (admin-curated). */
export function useTokenTier(
  factory: Address | undefined,
  token: Address | undefined,
) {
  return useReadContract({
    address: factory,
    abi: dropFactoryAbi,
    functionName: "tokenTier",
    args: token ? [token] : undefined,
    chainId: useChainId(),
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
    chainId: useChainId(),
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
    chainId: useChainId(),
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
    chainId: useChainId(),
    query: { enabled: !!drop && index !== undefined },
  });
}
