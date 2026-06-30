import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import type { ClaimProof } from "@tokamak-network/scatter-drop-merkle";
import { merkleDropAbi } from "../core/abis.js";

export interface ClaimRequest {
  to: Address;
  data: Hex;
}

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
export function buildClaimRequest(drop: Address, claim: ClaimProof): ClaimRequest {
  return { to: getAddress(drop), data: encodeClaim(claim) };
}
