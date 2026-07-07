/**
 * GitHub OAuth (docs/SOCIAL-TASK-DESIGN.md §2.2): binds the wallet to a GitHub
 * account id via the standard authorization-code flow, with no extra scope —
 * `GET /user` (identity) works on any valid token. Unlike Discord/Telegram,
 * the GITHUB_STAR verifier must act AS the user later (`GET
 * /user/starred/{owner}/{repo}`), so the access token is persisted on the
 * binding (see oauth/types.ts OAuthUser.accessToken) — GitHub user-to-server
 * tokens don't expire by default, so no refresh flow is needed.
 *
 * Server-only: the client secret must never reach the browser.
 */

import type { OAuthAdapter } from "./types";
import { GITHUB_API } from "../githubApi";

export const githubOAuth: OAuthAdapter = {
  configured() {
    return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  },

  authUrl(redirectUri, state) {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    // No scope: identity + public-repo star checks both work on a bare token.
    return url.toString();
  },

  async fetchUser(params, redirectUri) {
    const code = params.get("code");
    if (!code) return { error: "GitHub did not return an authorization code" };
    try {
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          client_id: process.env.GITHUB_CLIENT_ID!,
          client_secret: process.env.GITHUB_CLIENT_SECRET!,
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!tokenRes.ok) return { error: `GitHub token exchange failed (${tokenRes.status})` };
      const { access_token, error } = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
      };
      if (error || !access_token) {
        return { error: `GitHub token exchange failed (${error ?? "no access_token"})` };
      }

      const userRes = await fetch(`${GITHUB_API}/user`, {
        headers: { Authorization: `Bearer ${access_token}`, accept: "application/vnd.github+json" },
      });
      if (!userRes.ok) return { error: `GitHub user lookup failed (${userRes.status})` };
      const user = (await userRes.json()) as { id?: number; login?: string };
      if (!user.id) return { error: "GitHub returned no account id" };

      return {
        id: String(user.id),
        quality: JSON.stringify({ login: user.login ?? null }),
        accessToken: access_token,
      };
    } catch {
      return { error: "Failed to connect to GitHub during authentication. Please try again." };
    }
  },
};
