import { encodeAbiParameters, encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import type { ClaimProof } from "@tokamak-network/scatter-drop-merkle";
import { dropFactoryAbi, erc20Abi, merkleDropAbi } from "../core/abis.js";
import { FeeMode, type AirdropType } from "../types/index.js";

export { FeeMode };

/** Max PERCENT fee in basis points (mirrors DropFactory.MAX_FEE_BPS = 10%). */
export const MAX_FEE_BPS = 1000;

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
 * Native-ETH sentinel for the airdrop token — pass as `airdropToken` to
 * distribute ether. Matches `DropFactory.NATIVE` / `MerkleDrop.NATIVE` on-chain.
 * Native drops are funded via `msg.value` (totalAmount + fee), not `approve`.
 */
export const NATIVE_ETH: Address = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

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
  /**
   * Customer identity gate (W24). A zk-X509 IdentityRegistry to require, or
   * `address(0)` for an open campaign (no identity check at claim).
   */
  identityRegistry: Address;
  /**
   * Creation fee (in the airdrop token / wei). Required for native ETH drops
   * (`airdropToken === NATIVE_ETH`), where the request sends
   * `msg.value = totalAmount + fee`. Ignored for ERC-20 drops (fee is pulled via
   * `approve`). Compute off-chain via `feeOf(token, totalAmount)` / {@link computeFee}.
   */
  fee?: bigint;
}

/**
 * Build a `DropFactory.createDrop(...)` request (payable, 7-arg).
 *
 * ERC-20 drops: the fee is charged in the airdrop token on top of `totalAmount`;
 * `approve` the factory for `totalAmount + fee` first (see {@link buildApproveRequest}).
 * Native ETH drops (`airdropToken === NATIVE_ETH`): no approve — the request sends
 * `msg.value = totalAmount + fee`, so pass `fee` in params. `identityRegistry` may be
 * `address(0)` for an open (no-gate) campaign.
 */
export function buildCreateDropRequest(factory: Address, params: CreateDropParams): TxRequest {
  const airdropToken = getAddress(params.airdropToken);
  const isNative = airdropToken === NATIVE_ETH;
  // address(0) is never a valid airdrop token; native ETH uses the NATIVE_ETH sentinel.
  if (!isNative && airdropToken === NATIVE_FEE_TOKEN) {
    throw new Error("airdropToken cannot be address(0); use an ERC-20 or NATIVE_ETH");
  }
  const req: TxRequest = {
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
  // Native drops are funded by msg.value (totalAmount + fee), not approve/transferFrom.
  // `fee` is required here: on-chain `createDrop` demands msg.value == totalAmount + fee,
  // so a missing fee would build a tx guaranteed to revert (or underfund). Fail fast.
  if (isNative) {
    if (params.fee === undefined) {
      throw new Error(
        "native ETH drops require `fee` (msg.value = totalAmount + fee); compute it via feeOf()",
      );
    }
    req.value = params.totalAmount + params.fee;
  }
  return req;
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

function assertBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_FEE_BPS) {
    throw new Error(`bps must be an integer in [0, ${MAX_FEE_BPS}] (got ${bps})`);
  }
}

/** Build `DropFactory.setDefaultFeeBps(bps)` — admin sets the global default PERCENT rate. */
export function buildSetDefaultFeeBpsRequest(factory: Address, bps: number): TxRequest {
  assertBps(bps);
  return {
    to: getAddress(factory),
    data: encodeFunctionData({ abi: dropFactoryAbi, functionName: "setDefaultFeeBps", args: [bps] }),
  };
}

/** Build `DropFactory.setFeeBps(token, bps)` — admin sets a token's PERCENT rate (basis points). */
export function buildSetFeeBpsRequest(factory: Address, token: Address, bps: number): TxRequest {
  assertBps(bps);
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

// --- One-transaction create via approveAndCall / onApprove (Tokamak TON) ---

/**
 * The `DropParams` tuple `DropFactory.onApprove` decodes from its `data` argument
 * (`abi.decode(data, (DropParams))`). Field order MUST match the Solidity struct.
 */
const DROP_PARAMS = [
  {
    type: "tuple",
    components: [
      { name: "airdropType", type: "uint8" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "totalAmount", type: "uint256" },
      { name: "startTime", type: "uint64" },
      { name: "deadline", type: "uint64" },
      { name: "identityRegistry", type: "address" },
    ],
  },
] as const;

/** ERC-1363/TON-style `approveAndCall(spender, amount, data)`. */
const approveAndCallAbi = [
  {
    type: "function",
    name: "approveAndCall",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/**
 * ABI-encode the `DropParams` blob for `DropFactory.onApprove` — the `data`
 * argument to `token.approveAndCall`. Only the campaign params travel in `data`;
 * the airdrop token is the caller and `operator` is the approver (`msg.sender`).
 */
export function encodeOnApproveData(
  params: Pick<
    CreateDropParams,
    "airdropType" | "merkleRoot" | "totalAmount" | "startTime" | "deadline" | "identityRegistry"
  >,
): Hex {
  return encodeAbiParameters(DROP_PARAMS, [
    {
      airdropType: params.airdropType,
      merkleRoot: params.merkleRoot,
      totalAmount: params.totalAmount,
      startTime: params.startTime,
      deadline: params.deadline,
      identityRegistry: getAddress(params.identityRegistry),
    },
  ]);
}

/** Build a raw `token.approveAndCall(spender, amount, data)` request. */
export function buildApproveAndCallRequest(
  token: Address,
  spender: Address,
  amount: bigint,
  data: Hex,
): TxRequest {
  return {
    to: getAddress(token),
    data: encodeFunctionData({
      abi: approveAndCallAbi,
      functionName: "approveAndCall",
      args: [getAddress(spender), amount, data],
    }),
  };
}

/**
 * Build the one-transaction create for tokens that support `approveAndCall`
 * (Tokamak TON / SeigToken): `token.approveAndCall(factory, totalAmount + fee,
 * encodeOnApproveData(params))`. The token's callback (`DropFactory.onApprove`)
 * creates and funds the campaign in the same tx — no separate `approve`.
 *
 * `fee` must be the current `feeOf(token, totalAmount)` (on-chain `onApprove`
 * requires `amount == totalAmount + fee`). Not for native ETH (no approveAndCall).
 */
export function buildCreateDropOneTxRequest(
  factory: Address,
  params: CreateDropParams,
  fee: bigint,
): TxRequest {
  const token = getAddress(params.airdropToken);
  if (token === NATIVE_ETH || token === NATIVE_FEE_TOKEN) {
    throw new Error("approveAndCall one-tx path is for ERC-20 tokens (e.g. TON), not native ETH");
  }
  return buildApproveAndCallRequest(token, factory, params.totalAmount + fee, encodeOnApproveData(params));
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
