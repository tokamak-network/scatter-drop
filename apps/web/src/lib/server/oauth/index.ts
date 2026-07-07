/**
 * Provider registry — mirrors questVerifiers/index.ts so the [provider] OAuth
 * route stays provider-agnostic. Adding Telegram/GitHub (SOC-5') is a new
 * adapter file + one entry here, not a route change.
 */

import type { OAuthAdapter } from "./types";
import { discordOAuth } from "./discord";

const PROVIDERS: Record<string, OAuthAdapter> = {
  discord: discordOAuth,
};

export function oauthProviderFor(provider: string): OAuthAdapter | null {
  return PROVIDERS[provider] ?? null;
}
