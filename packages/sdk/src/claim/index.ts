import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import type { ClaimProof } from "@tokamak-network/scatter-drop-merkle";
import { dropFactoryAbi, erc20Abi, merkleDropAbi } from "../core/abis.js";
import type { AirdropType } from "../types/index.js";

/** A minimal `{ to, data }` transaction request, ready for a wallet client. */
export interface TxRequest {
  to: Address;
  data: Hex;
  /** Native value (wei) to send — set for payable calls like createDrop paid in ETH. */
  value?: bigint;
}

/** Native-ETH sentinel for the fee token (matches `address(0)` on-chain). */
export const NATIVE_FEE_TOKEN: Address = "0x0000000000000000000000000000000000000000";

/**
 * @deprecated use {@link TxRequest}. Kept as an interface (not a type alias)
 * for back-compat with consumers that extend/implement it.
 */
export interface ClaimRequest extends TxRequest {}

/**
 * ABI-encode a `MerkleDrop.claim(index, account, amount, proof)` call from a
 * ClaimProof (as produced by the merkle package / stored in proofs.json).
 */
export function encodeClaim(claim: ClaimProof): Hex {
  return encodeFunctionData({
    abi: merkleDropAbi,
    functionName: "claim",
    args: [BigInt(claim.index), getAddress(claim.account), BigInt(claim.amount), claim.proof],
  });
}

/**
 * Build a `{ to, data }` transaction request for claiming `claim` on the given
 * MerkleDrop. Send with a wallet client; the contract enforces the identity
 * gate and self-claim (account must equal msg.sender).
 */
export function buildClaimRequest(drop: Address, claim: ClaimProof): TxRequest {
  return { to: getAddress(drop), data: encodeClaim(claim) };
}

/** Token fee pricing mode. MUST match the Solidity `enum FeeMode`. */
export enum FeeMode {
  PERCENT = 0,
  FLAT = 1,
}

/** Parameters for `DropFactory.createDrop` (operator creates a campaign). */
export interface CreateDropParams {
  airdropType: AirdropType;
  airdropToken: Address;
  merkleRoot: Hex;
  totalAmount: bigint;
  /** Unix seconds the claim window opens (≤ now = starts immediately). */
  startTime: bigint;
  /** Unix seconds the claim window closes. On-chain: deadline - startTime ≥ MIN_DURATION. */
  deadline: bigint;
  /**
   * Customer identity gate (W24). A zk-X509 IdentityRegistry to require, or
   * `address(0)` for an open campaign (no identity check at claim).
   */
  identityRegistry: Address;
}

/**
 * Build a `DropFactory.createDrop(...)` request (non-payable, 7-arg).
 *
 * The fee is charged in the airdrop token, on top of `totalAmount`: before this,
 * `approve` the factory for `totalAmount + fee` (see {@link buildApproveRequest};
 * compute `fee` off-chain via `feeOf(token, totalAmount)` / {@link computeFee}).
 * `identityRegistry` may be `address(0)` for an open (no-gate) campaign.
 */
export function buildCreateDropRequest(factory: Address, params: CreateDropParams): TxRequest {
  // The airdrop token is escrowed via ERC-20 transferFrom (approve-first), not
  // msg.value — a native airdrop token would be silently underfunded.
  const airdropToken = getAddress(params.airdropToken);
  if (airdropToken === NATIVE_FEE_TOKEN) {
    throw new Error("airdropToken cannot be the native token (address(0)); use an ERC-20");
  }
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "createDrop",
      args: [
        params.airdropType,
        airdropToken,
        params.merkleRoot,
        params.totalAmount,
        params.startTime,
        params.deadline,
        getAddress(params.identityRegistry),
      ],
    }),
  };
}

/** Build `DropFactory.setDefaultFeeMode(mode)` — admin sets the global default mode. */
export function buildSetDefaultFeeModeRequest(factory: Address, mode: FeeMode): TxRequest {
  return {
    to: getAddress(factory),
    data: encodeFunctionData({ abi: dropFactoryAbi, functionName: "setDefaultFeeMode", args: [mode] }),
  };
}

/** Build `DropFactory.setFeeMode(token, mode)` — admin sets a token's fee mode (PERCENT/FLAT). */
export function buildSetFeeModeRequest(factory: Address, token: Address, mode: FeeMode): TxRequest {
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "setFeeMode",
      args: [getAddress(token), mode],
    }),
  };
}

/** Build `DropFactory.setDefaultFeeBps(bps)` — admin sets the global default PERCENT rate. */
export function buildSetDefaultFeeBpsRequest(factory: Address, bps: number): TxRequest {
  return {
    to: getAddress(factory),
    data: encodeFunctionData({ abi: dropFactoryAbi, functionName: "setDefaultFeeBps", args: [bps] }),
  };
}

/** Build `DropFactory.setFeeBps(token, bps)` — admin sets a token's PERCENT rate (basis points). */
export function buildSetFeeBpsRequest(factory: Address, token: Address, bps: number): TxRequest {
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "setFeeBps",
      args: [getAddress(token), bps],
    }),
  };
}

/** Build `DropFactory.setFlatFee(token, amount)` — admin sets a token's FLAT per-campaign fee. */
export function buildSetFlatFeeRequest(factory: Address, token: Address, amount: bigint): TxRequest {
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "setFlatFee",
      args: [getAddress(token), amount],
    }),
  };
}

/**
 * Build a `DropFactory.withdrawFees(token, amount)` transaction request
 * (admin-only; funds always go to the configured treasury).
 */
export function buildWithdrawFeesRequest(
  factory: Address,
  token: Address,
  amount: bigint,
): TxRequest {
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "withdrawFees",
      args: [getAddress(token), amount],
    }),
  };
}

/**
 * Build an ERC-20 `approve(spender, amount)` request — used before
 * createDrop (fee + deposit) so the factory can pull tokens.
 */
export function buildApproveRequest(token: Address, spender: Address, amount: bigint): TxRequest {
  return {
    to: getAddress(token),
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [getAddress(spender), amount],
    }),
  };
}

/**
 * Build `DropFactory.setAllowedToken(token, allowed)` — admin curates the airdrop
 * token allow-list (ALLOWED / NONE). Admin-only on-chain. There is no operator
 * self-registration: supported tokens are entirely the platform admin's curation.
 */
export function buildSetAllowedTokenRequest(
  factory: Address,
  token: Address,
  allowed: boolean,
): TxRequest {
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "setAllowedToken",
      args: [getAddress(token), allowed],
    }),
  };
}
