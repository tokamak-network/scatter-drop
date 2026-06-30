import { AirdropType } from "../types/index.js";

/** Human-readable label for an AirdropType (UI/logging). */
export function airdropTypeLabel(type: AirdropType): string {
  switch (type) {
    case AirdropType.CSV:
      return "CSV upload";
    case AirdropType.ONCHAIN_SNAPSHOT:
      return "On-chain snapshot";
    case AirdropType.ONCHAIN_GATED:
      return "On-chain gated";
    case AirdropType.SOCIAL:
      return "Social / task";
    default:
      throw new Error(`Unknown AirdropType: ${type as number}`);
  }
}

/**
 * True when `nowSeconds` is inside the claim window `[startTime, deadline]`.
 * Mirrors the on-chain gate (claim reverts before startTime or after deadline),
 * so the UI doesn't enable a claim that would revert. `startTime` defaults to 0
 * (open from genesis) for back-compat with deadline-only callers.
 */
export function isClaimWindowOpen(
  deadline: bigint,
  nowSeconds: bigint,
  startTime: bigint = 0n,
): boolean {
  return nowSeconds >= startTime && nowSeconds <= deadline;
}
