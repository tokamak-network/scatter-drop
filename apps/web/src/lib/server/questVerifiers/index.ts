/**
 * Verifier registry — maps QuestTask.kind to its platform adapter. The verify
 * route resolves through here so adding Telegram/GitHub/onchain (SOC-5') is a
 * new file + one entry, not a route change.
 */

import type { QuestVerifier } from "./types";
import { verifyDiscordTask } from "./discord";

/**
 * LINK_VISIT is the honest INTENT tier (§3.1): clicking is taken on trust and
 * the tier badge says so — there is nothing to check server-side.
 */
const verifyLinkVisit: QuestVerifier = async () => ({ ok: true, evidence: null });

const VERIFIERS: Record<string, QuestVerifier> = {
  DISCORD_JOIN: verifyDiscordTask,
  DISCORD_ROLE: verifyDiscordTask,
  LINK_VISIT: verifyLinkVisit,
};

export function verifierForKind(kind: string): QuestVerifier | null {
  return VERIFIERS[kind] ?? null;
}
