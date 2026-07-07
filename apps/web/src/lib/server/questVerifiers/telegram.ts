/**
 * Telegram verifier (docs/SOCIAL-TASK-DESIGN.md §2.2): membership checks run
 * through the ADMIN BOT — `getChatMember` — against the account id the
 * wallet bound via the Login Widget (see oauth/telegram.ts). The bot must be
 * an admin of the channel/group (an onboarding requirement for the operator,
 * same shape as Discord's bot-install requirement).
 */

import type { QuestVerifier } from "./types";

interface ChatMember {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  is_member?: boolean;
}

interface GetChatMemberResponse {
  ok: boolean;
  result?: ChatMember;
  error_code?: number;
  description?: string;
}

const ACTIVE_STATUSES = new Set(["creator", "administrator", "member"]);

export const verifyTelegramTask: QuestVerifier = async (task, _wallet, binding) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return {
      ok: false,
      reason: "Telegram verification is not configured on this server.",
      status: 503,
    };
  }
  if (!binding || binding.provider !== "telegram") {
    return { ok: false, reason: "Connect your Telegram account first.", status: 409 };
  }

  const { chatId } = JSON.parse(task.config) as { chatId?: string };
  if (!chatId) {
    return { ok: false, reason: "Task is misconfigured (missing chatId).", status: 500 };
  }

  let res: Response;
  try {
    const url = new URL(`https://api.telegram.org/bot${botToken}/getChatMember`);
    url.searchParams.set("chat_id", chatId);
    url.searchParams.set("user_id", binding.providerAccountId);
    res = await fetch(url);
  } catch {
    return { ok: false, reason: "Could not reach Telegram — try again later.", status: 502 };
  }

  const body = (await res.json().catch(() => null)) as GetChatMemberResponse | null;
  if (!body) {
    return {
      ok: false,
      reason: `Telegram verification failed (${res.status}) — try again later.`,
      status: 502,
    };
  }
  if (!body.ok || !body.result) {
    // A 400 here is almost always "bot is not an admin of this chat" or "chat
    // not found" — an OPERATOR setup problem, not the recipient's failure.
    const reason =
      res.status === 403 || /not enough rights|bot is not a member/i.test(body.description ?? "")
        ? "The verification bot is not an admin of this Telegram chat — ask the campaign operator to add it."
        : `Telegram verification failed: ${body.description ?? res.status}`;
    return { ok: false, reason, status: 503 };
  }

  const { status, is_member } = body.result;
  const isMember =
    ACTIVE_STATUSES.has(status) || (status === "restricted" && is_member === true);
  if (!isMember) {
    return { ok: false, reason: "You are not a member of this Telegram chat yet." };
  }

  return { ok: true, evidence: JSON.stringify({ status }) };
};
