/**
 * Discord OAuth (docs/SOCIAL-TASK-DESIGN.md §2.2): `identify` scope ONLY —
 * the flow exists purely to learn the user's stable account id for the
 * WalletSocial binding. The privacy-invasive `guilds` scope is never
 * requested; membership checks go through the platform bot instead.
 *
 * Server-only: the client secret must never reach the browser.
 */

import type { OAuthAdapter } from "./types";
import { DISCORD_API } from "../discordApi";

/**
 * Account creation time recovered from the snowflake id (free account-age
 * signal for the §7 quality thresholds — no extra API call).
 */
function snowflakeToDate(id: string): Date | null {
  try {
    return new Date(Number((BigInt(id) >> 22n) + 1420070400000n));
  } catch {
    return null;
  }
}

export const discordOAuth: OAuthAdapter = {
  configured() {
    return !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
  },

  authUrl(redirectUri, state) {
    const url = new URL("https://discord.com/oauth2/authorize");
    url.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  },

  async fetchUser(code, redirectUri) {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) return { error: `Discord token exchange failed (${tokenRes.status})` };
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    if (!access_token) return { error: "Discord returned no access token" };

    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}`, accept: "application/json" },
    });
    if (!userRes.ok) return { error: `Discord user lookup failed (${userRes.status})` };
    const user = (await userRes.json()) as { id?: string };
    if (!user.id) return { error: "Discord returned no account id" };

    const createdAt = snowflakeToDate(user.id);
    return {
      id: user.id,
      quality: JSON.stringify({ accountCreatedAt: createdAt ? createdAt.toISOString() : null }),
    };
  },
};
