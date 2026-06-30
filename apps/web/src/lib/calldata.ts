import { encodeFunctionData, type Address, type Hex } from "viem";
import {
  dropFactoryAbi,
  type AirdropType,
  type ClaimRequest,
} from "@tokamak-network/scatter-drop-sdk";

/**
 * Local calldata builders for the DropFactory, mirroring the SDK's
 * `buildClaimRequest` ({to,data}) pattern for the calls the SDK does not yet
 * expose. Keeping the ABI arg-order in one place (not scattered across pages).
 *
 * NOTE: these ideally live in the SDK next to `buildClaimRequest`
 * (`buildCreateDropRequest`/`buildWithdrawFeesRequest`) — flagged to K0. Until
 * then they live here so the web app does not import `dropFactoryAbi` /
 * `encodeFunctionData` in multiple page components.
 */

/**
 * True for a positive decimal string with at most `maxDecimals` fractional
 * digits. The decimals cap matches `parseUnits(s, maxDecimals)` so a value
 * with too many fractional digits is rejected here instead of throwing
 * "fractional part exceeds decimals" downstream.
 */
export function isPositiveDecimal(s: string, maxDecimals = 18): boolean {
  const match = s.match(/^\d+(?:\.(\d+))?$/);
  if (!match) return false;
  const decimals = match[1]?.length ?? 0;
  return decimals <= maxDecimals && Number(s) > 0;
}

export interface CreateDropParams {
  type: AirdropType;
  token: Address;
  merkleRoot: Hex;
  totalAmount: bigint;
  deadlineUnix: bigint;
  identityRegistry: Address;
}

export function buildCreateDropRequest(
  factory: Address,
  p: CreateDropParams,
): ClaimRequest {
  return {
    to: factory,
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "createDrop",
      args: [
        p.type,
        p.token,
        p.merkleRoot,
        p.totalAmount,
        p.deadlineUnix,
        p.identityRegistry,
      ],
    }),
  };
}

export function buildWithdrawFeesRequest(
  factory: Address,
  token: Address,
  amount: bigint,
): ClaimRequest {
  return {
    to: factory,
    data: encodeFunctionData({
      abi: dropFactoryAbi,
      functionName: "withdrawFees",
      args: [token, amount],
    }),
  };
}
