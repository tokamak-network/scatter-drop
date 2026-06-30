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
  }
}

/** True while `deadline` (unix seconds) is still in the future relative to `nowSeconds`. */
export function isClaimWindowOpen(deadline: bigint, nowSeconds: bigint): boolean {
  return nowSeconds <= deadline;
}
