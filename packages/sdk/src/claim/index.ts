import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import type { ClaimProof } from "@tokamak-network/scatter-drop-merkle";
import { dropFactoryAbi, erc20Abi, merkleDropAbi } from "../core/abis.js";
import type { AirdropType } from "../types/index.js";

/** A minimal `{ to, data }` transaction request, ready for a wallet client. */
export interface TxRequest {
  to: Address;
  data: Hex;
}

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
  /** Unix seconds. Must be > now (+ MIN_DURATION enforced on-chain). */
  deadline: bigint;
  identityRegistry: Address;
}

/**
 * Build a `DropFactory.createDrop(...)` transaction request. The operator must
 * first `approve` the factory for the per-type fee (in feeToken) and the
 * campaign's airdropToken for `totalAmount` (see {@link buildApproveRequest}).
 */
export function buildCreateDropRequest(factory: Address, params: CreateDropParams): TxRequest {
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
        params.deadline,
        getAddress(params.identityRegistry),
      ],
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
