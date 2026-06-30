import { Campaign, AllowedToken, Registry, FeeConfig, Participant } from './types';

export const INITIAL_TOKENS: AllowedToken[] = [
  {
    address: '0x0000000000000000000000000000000000000000',
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    isOfficial: true,
  },
  {
    address: '0x582d292b3487c66795f54363a0efc630f78bfcd4',
    name: 'The Open Network',
    symbol: 'TON',
    decimals: 9,
    isOfficial: true,
  },
  {
    address: '0x747206161476313a0efc630f78bfcd4703810471',
    name: 'ScatterDrop Native',
    symbol: 'SDROP',
    decimals: 18,
    isOfficial: true,
  },
  {
    address: '0x93201476313a0efc630f78bfcd4703810471abcd',
    name: 'Tokamak Ecosystem Token',
    symbol: 'TOK',
    decimals: 18,
    isOfficial: false,
  },
  {
    address: '0x818206161476313a0efc630f78bfcd470381049900',
    name: 'Test Project Token',
    symbol: 'TMT',
    decimals: 18,
    isOfficial: false,
  },
];

export const INITIAL_REGISTRIES: Registry[] = [
  {
    address: '0xOperatorCA1111111111111111111111111111',
    name: 'ScatterDrop Operator CA Registry',
    owner: '0xAdmin000000000000000000000000000000000000',
    trustedCAsCount: 3,
    isStandard: true,
    isOperatorRegistry: true,
    description: 'Required for campaign operators to authenticate and create drops on the platform.',
    verifiedWallets: {
      '0xOperator1111111111111111111111111111111': '2030-12-31T23:59:59Z',
      '0xAdmin000000000000000000000000000000000000': '2030-12-31T23:59:59Z',
    },
  },
  {
    address: '0xKR_NPKI_CA222222222222222222222222222222',
    name: 'KR-NPKI (Korea Basic Financial Identity)',
    owner: '0xAdmin000000000000000000000000000000000000',
    trustedCAsCount: 5,
    isStandard: true,
    isOperatorRegistry: false,
    description: 'National Public Key Infrastructure standard registry for basic financial KYC identity in South Korea.',
    verifiedWallets: {
      '0xCustomer111111111111111111111111111111': '2028-12-31T23:59:59Z',
      '0xAdmin000000000000000000000000000000000000': '2028-12-31T23:59:59Z',
    },
  },
  {
    address: '0xe-Residency_CA33333333333333333333333333',
    name: 'EE-eID (Estonia e-Residency & Government ID)',
    owner: '0xAdmin000000000000000000000000000000000000',
    trustedCAsCount: 2,
    isStandard: true,
    isOperatorRegistry: false,
    description: 'Estonia National Government Cryptographic ID & e-Residency program standard registry.',
    verifiedWallets: {
      '0xCustomer222222222222222222222222222222': '2028-12-31T23:59:59Z',
    },
  },
];

export const INITIAL_FEES: FeeConfig[] = [
  {
    tokenSymbol: 'ETH',
    tokenAddress: '0x0000000000000000000000000000000000000000',
    csvFee: 0.02,
    snapshotFee: 0.04,
    gatedFee: 0.06,
    socialFee: 0.08,
  },
  {
    tokenSymbol: 'TON',
    tokenAddress: '0x582d292b3487c66795f54363a0efc630f78bfcd4',
    csvFee: 15, // TON Discount! Roughly equivalent to $100 vs $200
    snapshotFee: 30,
    gatedFee: 45,
    socialFee: 60,
  },
  {
    tokenSymbol: 'SDROP',
    tokenAddress: '0x747206161476313a0efc630f78bfcd4703810471',
    csvFee: 100,
    snapshotFee: 200,
    gatedFee: 300,
    socialFee: 400,
  },
];

export const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: 'campaign-1',
    name: 'Tokamak Network Ecosystem Rewards',
    description: 'Ecosystem reward drop for early Tokamak Network builders and active node runners. Requires KR-NPKI Financial Identity validation to comply with regulatory guidelines and prevent sybil farm accounts.',
    logoUrl: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=128&auto=format&fit=crop&q=80',
    creator: '0xOperator1111111111111111111111111111111',
    tokenAddress: '0x747206161476313a0efc630f78bfcd4703810471',
    tokenSymbol: 'SDROP',
    tokenDecimals: 18,
    totalAmount: 50000,
    remainingAmount: 48500,
    createdAt: '2026-06-28T10:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    depositProofTx: '0x7b58c73d9d300e82c2a9d20c58e0a13d80cf260ea1152a5c37eb64d7df790100',
    customerRegistryAddress: '0xKR_NPKI_CA222222222222222222222222222222',
    type: 'CSV',
    distributionType: 'IMMEDIATE',
    merkleRoot: '0x53c9f2762ea1152a5c37eb64d7df790100ae9f830da0fca31792bc80de0ea13d80',
    csvData: [
      { address: '0xCustomer111111111111111111111111111111', amount: 1500 },
      { address: '0xCustomer222222222222222222222222222222', amount: 2500 },
      { address: '0xAdmin000000000000000000000000000000000000', amount: 1200 },
    ],
    claimsCount: 1,
  },
  {
    id: 'campaign-2',
    name: 'DeFi Staker Loyalty Premium Drop',
    description: 'On-chain loyalty rewards. Dynamic eligibility check: must hold at least 100 TOK tokens and be actively staking in the platform vault. Verified using Estonian e-Residency (EE-eID) smartcard authentication.',
    logoUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=128&auto=format&fit=crop&q=80',
    creator: '0xOperator1111111111111111111111111111111',
    tokenAddress: '0x93201476313a0efc630f78bfcd4703810471abcd',
    tokenSymbol: 'TOK',
    tokenDecimals: 18,
    totalAmount: 100000,
    remainingAmount: 100000,
    createdAt: '2026-06-29T14:30:00Z',
    endDate: '2026-09-30T18:00:00Z',
    depositProofTx: '0xae9f830da0fca31792bc80de0ea13d80cf1155aa51152d19f8a0319ca7b029ff',
    customerRegistryAddress: '0xe-Residency_CA33333333333333333333333333',
    type: 'GATED',
    distributionType: 'VESTING',
    vestingConfig: {
      cliffSeconds: 0,
      durationSeconds: 2592000, // 30 days
    },
    gatedCriteria: {
      minTokens: 100,
      isStaker: true,
    },
    claimsCount: 0,
  },
  {
    id: 'campaign-3',
    name: 'ScatterDrop Discord & Retweet Beta Supporters',
    description: 'Ecosystem boost campaign for our early community members who connected Twitter, retweeted our announcement, and joined Discord. Secured by Estonia Government ID (EE-eID) gate.',
    logoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&auto=format&fit=crop&q=80',
    creator: '0xOperator222222222222222222222222222222',
    tokenAddress: '0x747206161476313a0efc630f78bfcd4703810471',
    tokenSymbol: 'SDROP',
    tokenDecimals: 18,
    totalAmount: 20000,
    remainingAmount: 18000,
    createdAt: '2026-06-25T08:00:00Z',
    endDate: '2026-07-20T23:59:59Z',
    depositProofTx: '0x42f830dacd00ea1c2a0fd892bc8a0e0ea13a8a3a51152a5c00eb12da779cff11',
    customerRegistryAddress: '0xe-Residency_CA33333333333333333333333333',
    type: 'SOCIAL',
    distributionType: 'IMMEDIATE',
    csvData: [
      { address: '0xCustomer222222222222222222222222222222', amount: 2000 },
      { address: '0xCustomer111111111111111111111111111111', amount: 3000 },
    ],
    claimsCount: 1,
  },
];

export const INITIAL_PARTICIPANTS: Record<string, Participant[]> = {
  'campaign-1': [
    { address: '0xCustomer111111111111111111111111111111', amount: 1500, claimed: true, claimedAt: '2026-06-29T11:05:00Z', countryCode: 'KR', affiliation: 'Tokamak Node-1' },
    { address: '0xCustomer222222222222222222222222222222', amount: 2500, claimed: false, countryCode: 'KR', affiliation: 'Tokamak Builder' },
    { address: '0xAdmin000000000000000000000000000000000000', amount: 1200, claimed: false, countryCode: 'KR', affiliation: 'Ecosystem Advisory' },
  ],
  'campaign-2': [
    { address: '0xCustomer111111111111111111111111111111', amount: 5000, claimed: false, countryCode: 'EE', affiliation: 'Beta User' },
    { address: '0xCustomer222222222222222222222222222222', amount: 12000, claimed: false, countryCode: 'FI', affiliation: 'Staking Partner' },
    { address: '0xAdmin000000000000000000000000000000000000', amount: 8000, claimed: false, countryCode: 'EE', affiliation: 'Advisor' },
  ],
  'campaign-3': [
    { address: '0xCustomer222222222222222222222222222222', amount: 2000, claimed: true, claimedAt: '2026-06-26T15:22:00Z', countryCode: 'EE', affiliation: 'Community Contributor' },
    { address: '0xCustomer111111111111111111111111111111', amount: 3000, claimed: false, countryCode: 'FR', affiliation: 'Twitter Ambassador' },
  ],
};
