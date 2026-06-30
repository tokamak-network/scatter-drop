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
  identityRegistry: Address;
  /** Fee payment token. `NATIVE_FEE_TOKEN` (address(0)) = pay the fee in ETH. */
  feeToken: Address;
  /**
   * The creation fee for this (feeToken, type), from `feeOf(feeToken, type)`.
   * Required when `feeToken` is native (ETH) — it becomes msg.value. For ERC-20
   * fees it is ignored (the factory pulls via transferFrom after approve).
   */
  fee?: bigint;
}

/**
 * Build a `DropFactory.createDrop(...)` transaction request (payable).
 *
 * - **ETH fee** (`feeToken == NATIVE_FEE_TOKEN`): pass `fee`; it is sent as msg.value.
 * - **ERC-20 fee**: first `approve` the factory for `fee` (feeToken) and for
 *   `totalAmount` (airdropToken) — see {@link buildApproveRequest}; value stays 0.
 */
export function buildCreateDropRequest(factory: Address, params: CreateDropParams): TxRequest {
  // The airdrop token is escrowed via ERC-20 transferFrom (approve-first), not
  // msg.value. A native airdrop token would be silently underfunded — reject it
  // so the caller can't build a doomed/underfunded createDrop.
  if (getAddress(params.airdropToken) === NATIVE_FEE_TOKEN) {
    throw new Error("airdropToken cannot be the native token (address(0)); use an ERC-20");
  }
  const feeToken = getAddress(params.feeToken);
  const isEth = feeToken === NATIVE_FEE_TOKEN;
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "createDrop",
      args: [
        params.airdropType,
        getAddress(params.airdropToken),
        params.merkleRoot,
        params.totalAmount,
        params.startTime,
        params.deadline,
        getAddress(params.identityRegistry),
        feeToken,
      ],
    }),
    value: isEth ? (params.fee ?? 0n) : 0n,
  };
}

/**
 * Build `DropFactory.setFee(feeToken, type, amount)` — admin sets the per-(token,type)
 * creation fee. `feeToken = NATIVE_FEE_TOKEN` configures the ETH price; a cheaper
 * amount for one token (e.g. TON) is how a discount is offered. Admin-only on-chain.
 */
export function buildSetFeeRequest(
  factory: Address,
  feeToken: Address,
  airdropType: AirdropType,
  amount: bigint,
): TxRequest {
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "setFee",
      args: [getAddress(feeToken), airdropType, amount],
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
 * Build `DropFactory.addAllowedToken(token)` — a verified operator self-registers
 * an airdrop token (COMMUNITY tier, no admin approval needed).
 */
export function buildAddAllowedTokenRequest(factory: Address, token: Address): TxRequest {
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "addAllowedToken",
      args: [getAddress(token)],
    }),
  };
}

/**
 * Build `DropFactory.setOfficialToken(token, official)` — admin marks a token
 * OFFICIAL (top of list) or downgrades it. Admin-only on-chain.
 */
export function buildSetOfficialTokenRequest(
  factory: Address,
  token: Address,
  official: boolean,
): TxRequest {
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "setOfficialToken",
      args: [getAddress(token), official],
    }),
  };
}

/**
 * Build `DropFactory.removeAllowedToken(token)` — admin removes a token from the
 * registry (→ NONE), e.g. a malicious/impersonating token. Admin-only on-chain.
 */
export function buildRemoveAllowedTokenRequest(factory: Address, token: Address): TxRequest {
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "removeAllowedToken",
      args: [getAddress(token)],
    }),
  };
}
