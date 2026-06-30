import type { Address, Hex } from "viem";
import { AirdropType, type ClaimProof } from "@tokamak-network/scatter-drop-sdk";

/**
 * Stub data layer for the W6 scaffold.
 *
 * No live contract calls yet — every value here is placeholder data so the UI
 * shell can be built and reviewed independently of the M2 contracts / M3
 * deploy scripts. Types are aligned with `@tokamak-network/scatter-drop-sdk`
 * (frozen ABIs) so the read functions can be swapped for real viem/wagmi reads
 * in M3+ without changing call sites: server components already `await` them;
 * client components consume them via react-query `useQuery`.
 */

export { AirdropType };
export type { ClaimProof };

export type CampaignStatus = "active" | "ended";

/** Pad a short hex suffix into a valid 20-byte address (stub addresses). */
export const addr = (suffix: string): Address =>
  `0x${suffix.toLowerCase().padStart(40, "0")}` as Address;

export interface Campaign {
  id: string;
  name: string;
  description: string;
  type: AirdropType;
  /** Deployed MerkleDrop address (claim target). */
  drop: Address;
  token: Address;
  tokenSymbol: string;
  /** Human display amount, e.g. "1,000,000 ACME". */
  totalAmount: string;
  claimedPct: number;
  /** Display date (YYYY-MM-DD). */
  deadline: string;
  /** Claim window deadline as unix seconds (for isClaimWindowOpen). */
  deadlineUnix: bigint;
  identityRegistry: Address;
  /** Curated label for the registry, e.g. "KR-NPKI". */
  identityRegistryLabel: string;
  operator: Address;
  status: CampaignStatus;
}

/** Deployed DropFactory address (createDrop / withdrawFees target). */
export const FACTORY_ADDRESS: Address = addr("fac7");

export const FEE_BY_TYPE: Record<AirdropType, string> = {
  [AirdropType.CSV]: "10 FEE",
  [AirdropType.ONCHAIN_SNAPSHOT]: "25 FEE",
  [AirdropType.ONCHAIN_GATED]: "40 FEE",
  [AirdropType.SOCIAL]: "75 FEE",
};

const CAMPAIGNS: Campaign[] = [
  {
    id: "1",
    name: "Acme Loyalty Drop",
    description: "Reward for verified Acme customers (KR-NPKI gated).",
    type: AirdropType.CSV,
    drop: addr("d401"),
    token: addr("ace1"),
    tokenSymbol: "ACME",
    totalAmount: "1,000,000 ACME",
    claimedPct: 42,
    deadline: "2026-08-01",
    deadlineUnix: 1785535200n,
    identityRegistry: addr("c0a1"),
    identityRegistryLabel: "KR-NPKI",
    operator: addr("0901"),
    status: "active",
  },
  {
    id: "2",
    name: "DAO Contributor Snapshot",
    description: "Snapshot-based distribution to verified contributors.",
    type: AirdropType.ONCHAIN_SNAPSHOT,
    drop: addr("d402"),
    token: addr("da02"),
    tokenSymbol: "DAO",
    totalAmount: "500,000 DAO",
    claimedPct: 88,
    deadline: "2026-07-10",
    deadlineUnix: 1783684800n,
    identityRegistry: addr("c0a2"),
    identityRegistryLabel: "EE-eID",
    operator: addr("0902"),
    status: "active",
  },
  {
    id: "3",
    name: "Legacy Quest Rewards",
    description: "Completed campaign — claim window closed.",
    type: AirdropType.SOCIAL,
    drop: addr("d403"),
    token: addr("9e03"),
    tokenSymbol: "QST",
    totalAmount: "250,000 QST",
    claimedPct: 100,
    deadline: "2026-05-01",
    deadlineUnix: 1777660800n,
    identityRegistry: addr("c0a1"),
    identityRegistryLabel: "KR-NPKI",
    operator: addr("0901"),
    status: "ended",
  },
];

export async function listCampaigns(): Promise<Campaign[]> {
  return CAMPAIGNS;
}

export async function getCampaign(id: string): Promise<Campaign | undefined> {
  return CAMPAIGNS.find((c) => c.id === id);
}

export interface MyClaim {
  campaignId: string;
  campaignName: string;
  amount: string;
  claimed: boolean;
}

/** Pre-confirmed (Merkle) claims for the connected wallet. Empty is valid. */
export async function listMyClaims(address?: string): Promise<MyClaim[]> {
  if (!address) return [];
  return [
    // Campaign 1 already claimed (has a receipt); campaign 2 still available.
    { campaignId: "1", campaignName: "Acme Loyalty Drop", amount: "120 ACME", claimed: true },
    { campaignId: "2", campaignName: "DAO Contributor Snapshot", amount: "80 DAO", claimed: false },
  ];
}

/**
 * Campaigns created by the connected wallet. Empty is valid.
 * Stub: returns the active set for any connected address (real ownership filter
 * by createDrop sender lands in M6).
 */
export async function listManagedCampaigns(
  address?: string,
): Promise<Campaign[]> {
  if (!address) return [];
  return CAMPAIGNS.filter((c) => c.status === "active");
}

/** Stub admin gate — replaced by DropFactory.owner() check in M7. */
export function useIsAdmin(_address?: string): boolean {
  return false;
}

/**
 * Stub for the customer identity gate. Returns a `verifiedUntil` (unix seconds)
 * for `account` in `registry`; M3 swaps this for SDK `getVerifiedUntil`/
 * `getIdentityStatus` against a live PublicClient.
 *
 * Demo behaviour: wallets whose last hex nibble is even are "verified"
 * (far-future), odd are "unverified" (0) — so both gate branches are reachable.
 */
export async function getStubVerifiedUntil(
  _registry: Address,
  account?: Address,
): Promise<bigint> {
  if (!account) return 0n;
  const lastNibble = parseInt(account.slice(-1), 16);
  return Number.isNaN(lastNibble) || lastNibble % 2 !== 0 ? 0n : 9_999_999_999n;
}

export interface Eligibility {
  eligible: boolean;
  alreadyClaimed: boolean;
  /** SDK ClaimProof — feeds buildClaimRequest(drop, claim) unchanged in M5. */
  claim?: ClaimProof;
}

/**
 * Stub eligibility check. M5 swaps this for a real proofs.json / on-chain
 * lookup; the returned `claim` already matches the SDK `ClaimProof` shape so
 * `buildClaimRequest(drop, claim)` works unchanged.
 */
export async function getStubEligibility(
  campaignId: string,
  account?: Address,
): Promise<Eligibility> {
  if (!account) return { eligible: false, alreadyClaimed: false };
  // Campaign 3 is closed → not eligible; campaign 1 already claimed (shows the
  // receipt path); others get a fresh sample allocation (claim path).
  if (campaignId === "3") return { eligible: false, alreadyClaimed: false };
  return {
    eligible: true,
    alreadyClaimed: campaignId === "1",
    claim: {
      index: 0,
      account,
      amount: "120000000000000000000",
      proof: [`0x${"ab".repeat(32)}` as Hex, `0x${"cd".repeat(32)}` as Hex],
    },
  };
}

export interface ParticipantStats {
  eligible: number;
  verified: number;
  claimed: number;
  unclaimed: number;
  claimRatePct: number;
}

export async function getParticipantStats(
  _id: string,
): Promise<ParticipantStats> {
  return { eligible: 4200, verified: 3100, claimed: 1764, unclaimed: 1336, claimRatePct: 42 };
}

export interface AdminOverview {
  totalCampaigns: number;
  activeCampaigns: number;
  endedCampaigns: number;
  collectedFees: string;
  operatorCount: number;
  /** Fee token + treasury addresses (DropFactory config). */
  feeToken: Address;
  treasury: Address;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  return {
    totalCampaigns: CAMPAIGNS.length,
    activeCampaigns: CAMPAIGNS.filter((c) => c.status === "active").length,
    endedCampaigns: CAMPAIGNS.filter((c) => c.status === "ended").length,
    collectedFees: "1,250 FEE",
    operatorCount: 2,
    feeToken: addr("fee1"),
    treasury: addr("17ea"),
  };
}

export interface StandardRegistry {
  id: string;
  label: string;
  address: Address;
  trustedCAs: number;
}

export const STANDARD_REGISTRIES: StandardRegistry[] = [
  { id: "KR-NPKI", label: "KR-NPKI (Korea national PKI)", address: addr("c0a1"), trustedCAs: 12 },
  { id: "EE-eID", label: "EE-eID (Estonia eID)", address: addr("c0a2"), trustedCAs: 5 },
];
