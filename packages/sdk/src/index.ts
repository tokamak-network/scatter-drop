// Types
export { AirdropType, type CampaignInfo, type IdentityStatus } from "./types/index.js";

// Util
export { airdropTypeLabel, isClaimWindowOpen } from "./util/index.js";

// Merkle (off-chain tree/proof generation)
export * from "./merkle/index.js";

// Core (ABIs + on-chain reads)
export {
  merkleDropAbi,
  dropFactoryAbi,
  identityRegistryAbi,
  registryFactoryAbi,
  getCampaignInfo,
  isClaimed,
} from "./core/index.js";

// Identity (zk-X509 gate)
export {
  isVerificationValid,
  getVerifiedUntil,
  getIdentityStatus,
  isRegistry,
} from "./identity/index.js";

// Claim (calldata builder)
export { encodeClaim, buildClaimRequest, type ClaimRequest } from "./claim/index.js";
