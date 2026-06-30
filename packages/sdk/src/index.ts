// Types
export { AirdropType, TokenTier, type CampaignInfo, type IdentityStatus } from "./types/index.js";

// Util
export { airdropTypeLabel, isClaimWindowOpen } from "./util/index.js";

// Merkle (off-chain tree/proof generation)
export * from "./merkle/index.js";

// Core (ABIs + on-chain reads + addresses)
export {
  merkleDropAbi,
  dropFactoryAbi,
  identityRegistryAbi,
  registryFactoryAbi,
  erc20Abi,
  getCampaignInfo,
  isClaimed,
  getTokenTier,
  isTokenAllowed,
  getFeeOf,
  ZK_X509,
  getZkX509,
  parseDeployment,
  type ZkX509Addresses,
  type ScatterDropDeployment,
} from "./core/index.js";

// Identity (zk-X509 gate)
export {
  isVerificationValid,
  getVerifiedUntil,
  getIdentityStatus,
  isRegistry,
} from "./identity/index.js";

// Tx calldata builders (claim / createDrop / withdrawFees / approve)
export {
  encodeClaim,
  buildClaimRequest,
  buildCreateDropRequest,
  buildWithdrawFeesRequest,
  buildApproveRequest,
  buildSetFeeRequest,
  buildAddAllowedTokenRequest,
  buildSetOfficialTokenRequest,
  buildRemoveAllowedTokenRequest,
  NATIVE_FEE_TOKEN,
  type TxRequest,
  type ClaimRequest,
  type CreateDropParams,
} from "./claim/index.js";
