export type AirdropType = 'CSV' | 'SNAPSHOT' | 'GATED' | 'SOCIAL';
export type DistributionType = 'IMMEDIATE' | 'VESTING' | 'FCFS';

export interface VestingConfig {
  cliffSeconds: number;
  durationSeconds: number;
}

export interface GatedCriteria {
  minTokens?: number;
  requiredNFT?: string;
  isStaker?: boolean;
}

export interface CsvRow {
  address: string;
  amount: number;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
  creator: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  totalAmount: number;
  remainingAmount: number;
  createdAt: string;
  endDate: string;
  depositProofTx: string;
  customerRegistryAddress: string; // zk-X509 registry
  type: AirdropType;
  distributionType: DistributionType;
  vestingConfig?: VestingConfig;
  gatedCriteria?: GatedCriteria;
  merkleRoot?: string;
  csvData?: CsvRow[];
  isSwept?: boolean;
  claimsCount: number;
}

export interface Participant {
  address: string;
  amount: number;
  claimed: boolean;
  claimedAt?: string;
  vestingClaimedAmount?: number;
  countryCode?: string; // Standard CA choices can reveal these
  affiliation?: string;
}

export interface Registry {
  address: string;
  name: string;
  owner: string;
  trustedCAsCount: number;
  isStandard: boolean;
  isOperatorRegistry: boolean;
  description: string;
  verifiedWallets: Record<string, string>; // wallet -> verifiedUntil timestamp (ISO string)
}

export interface FeeConfig {
  tokenSymbol: string;
  tokenAddress: string;
  csvFee: number;
  snapshotFee: number;
  gatedFee: number;
  socialFee: number;
}

export interface AllowedToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  isOfficial: boolean;
}

export interface WalletState {
  address: string;
  isConnected: boolean;
  tokenBalances: Record<string, number>; // symbol -> amount
  nftCollection: string[]; // NFT IDs or names
  isStaking: boolean;
}
