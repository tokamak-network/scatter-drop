/**
 * Social OAuth adapter contract — mirrors questVerifiers/types.ts so the
 * [provider] route stays generic and adding a provider (SOC-5': Telegram,
 * GitHub) is a new adapter file + one registry entry, not a route edit.
 */

export interface OAuthUser {
  id: string;
  /** JSON quality signal for the §7 thresholds (account age, …), or null. */
  quality: string | null;
  /**
   * User access token to persist, only when the provider's verifier needs to
   * act as the user later (GitHub's star check). Omitted/undefined for
   * providers that verify via a platform bot instead (Discord, Telegram).
   */
  accessToken?: string;
}

export interface OAuthAdapter {
  configured(): boolean;
  authUrl(redirectUri: string, state: string): string;
  /**
   * Resolve the callback's query params into an account. Takes the full
   * params (not just a `code`) because not every provider uses an
   * authorization-code exchange — Telegram's login widget redirect instead
   * delivers signed user fields directly.
   */
  fetchUser(params: URLSearchParams, redirectUri: string): Promise<OAuthUser | { error: string }>;
}
