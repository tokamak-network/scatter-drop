/**
 * Telegram Login (docs/SOCIAL-TASK-DESIGN.md §2.2): the classic HMAC-signed
 * Login Widget redirect, NOT the newer OpenID Connect flow — no `code`
 * exchange, no client secret. Telegram signs the returned user fields itself;
 * we verify that signature with SHA256(bot token) as the HMAC key. Membership
 * checks go through the platform bot (getChatMember), same division of
 * responsibility as Discord's identify-only OAuth + bot-based verification.
 *
 * Requires the bot's domain to be registered via @BotFather → /setdomain
 * before login requests from that origin are accepted.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { OAuthAdapter } from "./types";

/** Fields Telegram itself signs — everything else in the query is ours (e.g. `state`) or noise. */
const SIGNED_FIELDS = ["id", "first_name", "last_name", "username", "photo_url", "auth_date"];
/** Reject a login payload older than this — caps replay of a stale shared link. */
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

function botId(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const id = token?.split(":")[0];
  return id && /^\d+$/.test(id) ? id : null;
}

export const telegramOAuth: OAuthAdapter = {
  configured() {
    return botId() !== null;
  },

  authUrl(redirectUri, state) {
    const id = botId()!;
    const returnTo = new URL(redirectUri);
    // Telegram appends its own signed fields onto whatever query returnTo
    // already carries, so `state` survives the round trip without Telegram
    // needing to know about it.
    returnTo.searchParams.set("state", state);
    const url = new URL("https://oauth.telegram.org/auth");
    url.searchParams.set("bot_id", id);
    url.searchParams.set("origin", returnTo.origin);
    url.searchParams.set("request_access", "write");
    url.searchParams.set("return_to", returnTo.toString());
    return url.toString();
  },

  async fetchUser(params) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return { error: "Telegram login is not configured on this server" };

    const hash = params.get("hash");
    const id = params.get("id");
    const authDate = params.get("auth_date");
    if (!hash || !id || !authDate) {
      return { error: "Telegram did not return a signed login payload" };
    }

    const dataCheckString = SIGNED_FIELDS.filter((k) => params.has(k))
      .map((k) => `${k}=${params.get(k)}`)
      .sort()
      .join("\n");
    const secretKey = createHash("sha256").update(botToken).digest();
    const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { error: "Telegram login signature did not verify" };
    }

    const ageSeconds = Date.now() / 1000 - Number(authDate);
    if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > MAX_AUTH_AGE_SECONDS) {
      return { error: "Telegram login link has expired — try linking again." };
    }

    return {
      id,
      quality: JSON.stringify({ username: params.get("username") ?? null }),
    };
  },
};
