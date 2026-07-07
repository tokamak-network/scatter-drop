/** Shared GitHub REST base — used by both the OAuth adapter and the star-check verifier. */
export const GITHUB_API = "https://api.github.com";

/**
 * GitHub rejects any API request without a User-Agent (403 Forbidden), so every
 * call must send one. Shared here so the OAuth adapter and verifier stay in sync.
 */
export const GITHUB_API_HEADERS = {
  accept: "application/vnd.github+json",
  "user-agent": "scatter-drop",
} as const;
