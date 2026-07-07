/**
 * Discord verifier (docs/SOCIAL-TASK-DESIGN.md §2.2): membership/role checks
 * run through the PLATFORM BOT — `GET /guilds/{id}/members/{uid}` with the bot
 * token — against the account id the wallet bound via OAuth `identify`. The
 * privacy-invasive `guilds` scope (the user's full server list) is never
 * requested; instead the operator installs the bot on their server, which is
 * an onboarding requirement.
 */

import type { QuestVerifier, VerifyOutcome } from "./types";
import { DISCORD_API } from "../discordApi";

interface GuildMember {
  joined_at?: string;
  roles?: string[];
}

/**
 * Fetch the member object, distinguishing "not a member" (task simply not
 * done) from infra errors (bot missing from the guild, rate limits, …).
 */
async function fetchMember(
  guildId: string,
  userId: string,
  botToken: string,
): Promise<{ member: GuildMember } | { fail: VerifyOutcome & { ok: false } }> {
  let res: Response;
  try {
    res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${botToken}`, accept: "application/json" },
    });
  } catch {
    // Network failure (DNS, timeout, Discord down) — a verifier outcome, not
    // an unhandled exception that would 500 the whole verify route.
    return {
      fail: {
        ok: false,
        reason: "Could not reach Discord — try again later.",
        status: 502,
      },
    };
  }
  if (res.status === 404) {
    return {
      fail: { ok: false, reason: "You are not a member of this Discord server yet." },
    };
  }
  if (res.status === 403 || res.status === 401) {
    // The bot isn't in the guild (or lost permission) — an OPERATOR setup
    // problem, not the recipient's failure; say so instead of "not a member".
    return {
      fail: {
        ok: false,
        reason:
          "The verification bot is not installed on this Discord server — ask the campaign operator to add it.",
        status: 503,
      },
    };
  }
  if (res.status === 429) {
    return {
      fail: {
        ok: false,
        reason: "Discord is rate-limiting verification — try again in a minute.",
        status: 503,
      },
    };
  }
  if (!res.ok) {
    return {
      fail: {
        ok: false,
        reason: `Discord verification failed (${res.status}) — try again later.`,
        status: 502,
      },
    };
  }
  return { member: (await res.json()) as GuildMember };
}

export const verifyDiscordTask: QuestVerifier = async (task, _wallet, binding) => {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    // §3.3: no key → the check is unavailable, never silently degraded.
    return {
      ok: false,
      reason: "Discord verification is not configured on this server.",
      status: 503,
    };
  }
  if (!binding || binding.provider !== "discord") {
    return { ok: false, reason: "Connect your Discord account first.", status: 409 };
  }

  const { guildId, roleId } = JSON.parse(task.config) as {
    guildId?: string;
    roleId?: string;
  };
  if (!guildId) {
    return { ok: false, reason: "Task is misconfigured (missing guildId).", status: 500 };
  }

  const result = await fetchMember(guildId, binding.providerAccountId, botToken);
  if ("fail" in result) return result.fail;
  const { member } = result;

  if (task.kind === "DISCORD_ROLE") {
    if (!roleId) {
      return { ok: false, reason: "Task is misconfigured (missing roleId).", status: 500 };
    }
    if (!member.roles?.includes(roleId)) {
      return {
        ok: false,
        reason: "You don't have the required role on this server yet.",
      };
    }
    // Minimal evidence (§8 privacy): when the member joined + which role
    // matched — enough for close-time re-checks and sybil flags, nothing more.
    return {
      ok: true,
      evidence: JSON.stringify({ joinedAt: member.joined_at ?? null, roleId }),
    };
  }

  return { ok: true, evidence: JSON.stringify({ joinedAt: member.joined_at ?? null }) };
};
