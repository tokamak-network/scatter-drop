/**
 * Minimal ABIs matching the frozen contract signatures (seam ②, DEV-PLAN §2).
 * These are hand-authored stubs for M1; once M2 contracts land they will be
 * replaced/augmented by the generated Foundry ABIs. Keep in sync with COORDINATION.md.
 */

export const merkleDropAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "index", type: "uint256" },
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isClaimed",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  { type: "function", name: "sweep", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "merkleRoot", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bytes32" }] },
  { type: "function", name: "startTime", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint64" }] },
  { type: "function", name: "deadline", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint64" }] },
  { type: "function", name: "identityRegistry", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "operator", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
] as const;

export const dropFactoryAbi = [
  {
    type: "event",
    name: "DropCreated",
    inputs: [
      { name: "drop", type: "address", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "airdropType", type: "uint8", indexed: true },
      { name: "airdropToken", type: "address", indexed: false },
      { name: "identityRegistry", type: "address", indexed: false },
      { name: "merkleRoot", type: "bytes32", indexed: false },
      { name: "totalAmount", type: "uint256", indexed: false },
      { name: "startTime", type: "uint64", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "createDrop",
    stateMutability: "payable",
    inputs: [
      { name: "airdropType", type: "uint8" },
      { name: "airdropToken", type: "address" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "totalAmount", type: "uint256" },
      { name: "startTime", type: "uint64" },
      { name: "deadline", type: "uint64" },
      { name: "identityRegistry", type: "address" },
    ],
    outputs: [{ name: "drop", type: "address" }],
  },
  {
    type: "function",
    name: "feeOf",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "totalAmount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "defaultFeeMode",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "defaultFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "flatFee",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "feeModeOf",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "feeBpsOf",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "setDefaultFeeMode",
    stateMutability: "nonpayable",
    inputs: [{ name: "mode", type: "uint8" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setFeeMode",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "mode", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setDefaultFeeBps",
    stateMutability: "nonpayable",
    inputs: [{ name: "bps", type: "uint16" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setFeeBps",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "bps", type: "uint16" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setFlatFee",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "AllowedTokenSet",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "allowed", type: "bool", indexed: false },
      { name: "caller", type: "address", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "setAllowedToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "tokenTier",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "isAllowed",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "collectedFees",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdrawFees",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "supportsApproveAndCall",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setApproveAndCallSupport",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "supported", type: "bool" },
    ],
    outputs: [],
  },
  // On-chain encoder for onApprove's `data`; its tuple input gives DropParams an
  // ABI surface so abi-drift.test.ts pins the struct's field order/types.
  {
    type: "function",
    name: "encodeDropParams",
    stateMutability: "pure",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "airdropType", type: "uint8" },
          { name: "merkleRoot", type: "bytes32" },
          { name: "totalAmount", type: "uint256" },
          { name: "startTime", type: "uint64" },
          { name: "deadline", type: "uint64" },
          { name: "identityRegistry", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

export const identityRegistryAbi = [
  {
    type: "function",
    name: "verifiedUntil",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint64" }],
  },
] as const;

export const registryFactoryAbi = [
  {
    type: "function",
    name: "isRegistry",
    stateMutability: "view",
    inputs: [{ name: "registry", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** Minimal ERC-20 ABI for the approve flow that precedes createDrop/claim. */
export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  // ERC-1363 / Tokamak-TON style: approve + call the spender's onApprove in one tx.
  {
    type: "function",
    name: "approveAndCall",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
