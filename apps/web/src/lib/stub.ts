/**
 * Stub data layer for the W6 scaffold.
 *
 * No contract calls yet — every value here is placeholder data so the UI shell
 * can be built and reviewed independently of the M2 contracts / M3 scripts.
 * These functions are the seam where wagmi `useReadContract` / event-indexing
 * hooks will be wired in later milestones (M5–M7).
 */

export type AirdropType = "CSV" | "ONCHAIN_SNAPSHOT" | "ONCHAIN_GATED" | "SOCIAL";

export type CampaignStatus = "active" | "ended";

export interface Campaign {
  id: string;
  name: string;
  description: string;
  type: AirdropType;
  token: string;
  totalAmount: string;
  claimedPct: number;
  deadline: string;
  identityRegistry: string;
  operator: string;
  status: CampaignStatus;
}

export const FEE_BY_TYPE: Record<AirdropType, string> = {
  CSV: "10 FEE",
  ONCHAIN_SNAPSHOT: "25 FEE",
  ONCHAIN_GATED: "40 FEE",
  SOCIAL: "75 FEE",
};

const CAMPAIGNS: Campaign[] = [
  {
    id: "1",
    name: "Acme Loyalty Drop",
    description: "Reward for verified Acme customers (KR-NPKI gated).",
    type: "CSV",
    token: "0xToken…Acme",
    totalAmount: "1,000,000 ACME",
    claimedPct: 42,
    deadline: "2026-08-01",
    identityRegistry: "KR-NPKI",
    operator: "0xOperator…01",
    status: "active",
  },
  {
    id: "2",
    name: "DAO Contributor Snapshot",
    description: "Snapshot-based distribution to verified contributors.",
    type: "ONCHAIN_SNAPSHOT",
    token: "0xToken…Dao",
    totalAmount: "500,000 DAO",
    claimedPct: 88,
    deadline: "2026-07-10",
    identityRegistry: "EE-eID",
    operator: "0xOperator…02",
    status: "active",
  },
  {
    id: "3",
    name: "Legacy Quest Rewards",
    description: "Completed campaign — claim window closed.",
    type: "SOCIAL",
    token: "0xToken…Quest",
    totalAmount: "250,000 QST",
    claimedPct: 100,
    deadline: "2026-05-01",
    identityRegistry: "KR-NPKI",
    operator: "0xOperator…01",
    status: "ended",
  },
];

export function listCampaigns(): Campaign[] {
  return CAMPAIGNS;
}

export function getCampaign(id: string): Campaign | undefined {
  return CAMPAIGNS.find((c) => c.id === id);
}

export interface MyClaim {
  campaignId: string;
  campaignName: string;
  amount: string;
  claimed: boolean;
}

/** Pre-confirmed (Merkle) claims for the connected wallet. Empty is valid. */
export function listMyClaims(_address?: string): MyClaim[] {
  if (!_address) return [];
  return [
    { campaignId: "1", campaignName: "Acme Loyalty Drop", amount: "120 ACME", claimed: false },
  ];
}

/** Campaigns created by the connected wallet. Empty is valid. */
export function listManagedCampaigns(_address?: string): Campaign[] {
  if (!_address) return [];
  return CAMPAIGNS.filter((c) => c.operator === "0xOperator…01");
}

/** Stub admin gate — replaced by DropFactory.owner() check in M7. */
export function useIsAdmin(_address?: string): boolean {
  return false;
}

export interface ParticipantStats {
  eligible: number;
  verified: number;
  claimed: number;
  unclaimed: number;
  claimRatePct: number;
}

export function getParticipantStats(_id: string): ParticipantStats {
  return { eligible: 4200, verified: 3100, claimed: 1764, unclaimed: 1336, claimRatePct: 42 };
}

export interface AdminOverview {
  totalCampaigns: number;
  activeCampaigns: number;
  endedCampaigns: number;
  collectedFees: string;
  operatorCount: number;
}

export function getAdminOverview(): AdminOverview {
  return {
    totalCampaigns: CAMPAIGNS.length,
    activeCampaigns: CAMPAIGNS.filter((c) => c.status === "active").length,
    endedCampaigns: CAMPAIGNS.filter((c) => c.status === "ended").length,
    collectedFees: "1,250 FEE",
    operatorCount: 2,
  };
}

export const STANDARD_REGISTRIES = [
  { id: "KR-NPKI", label: "KR-NPKI (Korea national PKI)", trustedCAs: 12 },
  { id: "EE-eID", label: "EE-eID (Estonia eID)", trustedCAs: 5 },
];
