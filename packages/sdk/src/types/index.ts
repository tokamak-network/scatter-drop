import type { Address, Hex } from "viem";

/**
 * Eligibility/airdrop type. The numeric value is the on-chain `uint8`
 * passed to `DropFactory.createDrop` and used to look up `feeOf[type]`.
 * MUST match the Solidity `enum AirdropType` ordering.
 */
export enum AirdropType {
  CSV = 0,
  ONCHAIN_SNAPSHOT = 1,
  ONCHAIN_GATED = 2,
  SOCIAL = 3,
}

/** On-chain immutable view of a deployed MerkleDrop campaign. */
export interface CampaignInfo {
  drop: Address;
  token: Address;
  merkleRoot: Hex;
  deadline: bigint;
  identityRegistry: Address;
  operator: Address;
}

/** Result of evaluating a wallet's identity gate against a registry. */
export interface IdentityStatus {
  registry: Address;
  account: Address;
  verifiedUntil: bigint;
  isVerified: boolean;
}
