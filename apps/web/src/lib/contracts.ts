"use client";

import { useChainId, useReadContract } from "wagmi";
import { isAddress, zeroAddress, type Address } from "viem";
import { useQuery } from "@tanstack/react-query";
import {
  dropFactoryAbi,
  identityRegistryAbi,
  isVerificationValid,
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

/** Explicit-chain override for read hooks (defaults to the wallet's chain). */
export type ChainOpt = { chainId?: number };

/**
 * Active deployment resolved from the network registry — the connected
 * wallet's chain by default, or an explicit `opts.chainId` for surfaces that
 * know their target chain (e.g. an announcement viewed from another network).
 */
export function useDeployment(opts?: ChainOpt) {
  const walletChainId = useChainId();
  const chainId = opts?.chainId ?? walletChainId;
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

// `paused()` is a new DropFactory view (service pause); read it with a minimal
// abi so we don't depend on the SDK's bundled abi being regenerated.
const pausedAbi = [
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

const supportsApproveAndCallAbi = [
  {
    type: "function",
    name: "supportsApproveAndCall",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Admin-curated flag: does the factory consider `token` an approveAndCall (one-tx) token? */
export function useSupportsApproveAndCall(
  factory: Address | undefined,
  token: Address | undefined,
) {
  return useReadContract({
    address: factory,
    abi: supportsApproveAndCallAbi,
    functionName: "supportsApproveAndCall",
    args: token ? [token] : undefined,
    chainId: useChainId(),
    query: { enabled: !!factory && !!token },
  });
}

/** DropFactory.paused() — when true, createDrop is blocked (service pause). */
export function usePaused(factory: Address | undefined) {
  return useReadContract({
    address: factory,
    abi: pausedAbi,
    functionName: "paused",
    chainId: useChainId(),
    query: { enabled: !!factory },
  });
}

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

/**
 * ERC20.symbol() for an address — for human-readable amount labels.
 * `chainId` overrides the wallet chain (e.g. a form-selected network).
 */
export function useErc20Symbol(token: Address | undefined, chainId?: number) {
  const walletChainId = useChainId();
  return useReadContract({
    address: token,
    abi: erc20SymbolAbi,
    functionName: "symbol",
    chainId: chainId ?? walletChainId,
    query: { enabled: !!token },
  });
}

const erc20NameAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

/**
 * ERC20.name() for an address — to confirm a pasted contract is the intended
 * token. `chainId` overrides the wallet chain like useErc20Symbol's.
 */
export function useErc20Name(token: Address | undefined, chainId?: number) {
  const walletChainId = useChainId();
  return useReadContract({
    address: token,
    abi: erc20NameAbi,
    functionName: "name",
    chainId: chainId ?? walletChainId,
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

const erc20AllowanceAbi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** ERC20.allowance(owner, spender) — to tell if the drop is already approved. */
export function useErc20Allowance(
  token: Address | undefined,
  owner: Address | undefined,
  spender: Address | undefined,
) {
  return useReadContract({
    address: token,
    abi: erc20AllowanceAbi,
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    chainId: useChainId(),
    query: { enabled: !!token && !!owner && !!spender },
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

/** The gate outcome for one (registry, account) pair. */
export type GateStatus =
  /** No identity gate (registry is unset / the zero-address sentinel). */
  | "off"
  /** Gated, but no account to check yet. */
  | "noAccount"
  /** Gated, account set, the `verifiedUntil` read is still resolving. */
  | "loading"
  /** Gated and the account's verification is current. */
  | "verified"
  /** Gated and the account is not verified (or expired). */
  | "unverified";

/**
 * The single "does this wallet pass the gate?" rule — the zero-address = no-gate
 * sentinel plus the SDK's `isVerificationValid` freshness check — resolved from
 * `verifiedUntil`. Any surface that needs gate state (preview, claim panel,
 * detail card) should read it here so the rule lives in one place.
 */
export function useGateState(
  registry: Address | undefined,
  account: Address | undefined,
): { status: GateStatus; verifiedUntil: bigint | undefined; gated: boolean } {
  const gated = !!registry && isAddress(registry, { strict: false }) && registry !== zeroAddress;
  const { data: verifiedUntil, isLoading, isError } = useVerifiedUntil(
    gated ? registry : undefined,
    account,
  );
  const now = BigInt(Math.floor(Date.now() / 1000));
  const status: GateStatus = !gated
    ? "off"
    : !account
      ? "noAccount"
      : isLoading
        ? "loading"
        : // A failed read (RPC error, or the registry isn't a live contract so
          // the call reverts) or a still-missing value resolves conservatively
          // to unverified — never a wallet that can't be confirmed as passing.
          isError || verifiedUntil === undefined
          ? "unverified"
          : isVerificationValid(verifiedUntil, now)
            ? "verified"
            : "unverified";
  return { status, verifiedUntil, gated };
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
