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
  /** Claim window start as unix seconds (0 = open immediately). */
  startTimeUnix: bigint;
  /** Claim window deadline as unix seconds. */
  deadlineUnix: bigint;
  identityRegistry: Address;
  /** Curated label for the registry, e.g. "KR-NPKI". */
  identityRegistryLabel: string;
  operator: Address;
  status: CampaignStatus;
}

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
    startTimeUnix: 0n,
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
    startTimeUnix: 0n,
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
    startTimeUnix: 0n,
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

export interface Eligibility {
  eligible: boolean;
  alreadyClaimed: boolean;
  /** SDK ClaimProof — feeds buildClaimRequest(drop, claim) unchanged in M5. */
  claim?: ClaimProof;
}

/**
 * Off-chain eligibility (proofs.json) seam. The returned `claim` matches the
 * SDK `ClaimProof` shape so `buildClaimRequest(drop, claim)` works unchanged;
 * the `alreadyClaimed` state is overridden by the live on-chain `isClaimed`
 * read in the claim panel.
 *
 * Stub values track the dev-fork seed (index 0, 1000e18, fixed single-leaf
 * proof) so the seeded recipient's claim succeeds against the real drop. A full
 * proofs.json lookup (per address) is the follow-up once the seed publishes one.
 */
const DEMO_PROOF: Hex[] = [
  "0x38e53589afaea9410bbb608dab49a3b28297ff97d5cea6d06ba5937dfec9ef93",
];
// dev-fork seed recipient (anvil #1). Only this wallet has a valid proof in the
// seeded tree, so only it is eligible — others would revert with InvalidProof.
const SEED_RECIPIENT = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

export async function getStubEligibility(
  _campaignId: string,
  account?: Address,
): Promise<Eligibility> {
  if (!account || account.toLowerCase() !== SEED_RECIPIENT) {
    return { eligible: false, alreadyClaimed: false };
  }
  return {
    eligible: true,
    alreadyClaimed: false,
    claim: {
      index: 0,
      account,
      amount: "1000000000000000000000",
      proof: DEMO_PROOF,
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
