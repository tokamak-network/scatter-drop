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
  getFeeModeOf,
  getFeeBpsOf,
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
  buildPublishProofsRequest,
  buildWithdrawFeesRequest,
  buildApproveRequest,
  encodeOnApproveData,
  buildApproveAndCallRequest,
  buildCreateDropOneTxRequest,
  buildSetApproveAndCallSupportRequest,
  buildSetDefaultFeeModeRequest,
  buildSetFeeModeRequest,
  buildSetDefaultFeeBpsRequest,
  buildSetFeeBpsRequest,
  buildSetFlatFeeRequest,
  MAX_FEE_BPS,
  buildSetAllowedTokenRequest,
  FeeMode,
  NATIVE_FEE_TOKEN,
  NATIVE_ETH,
  type TxRequest,
  type ClaimRequest,
  type CreateDropParams,
} from "./claim/index.js";
