/**
 * Social OAuth adapter contract — mirrors questVerifiers/types.ts so the
 * [provider] route stays generic and adding a provider (SOC-5': Telegram,
 * GitHub) is a new adapter file + one registry entry, not a route edit.
 */

export interface OAuthUser {
  id: string;
  /** JSON quality signal for the §7 thresholds (account age, …), or null. */
  quality: string | null;
}

export interface OAuthAdapter {
  configured(): boolean;
  authUrl(redirectUri: string, state: string): string;
  fetchUser(code: string, redirectUri: string): Promise<OAuthUser | { error: string }>;
}
