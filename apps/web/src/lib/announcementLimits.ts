/**
 * Announcement field caps + link-URL rule, shared by the server validator
 * (lib/server/announcementInput) and the client form so the two can't drift.
 * Isomorphic — no server or client-only imports.
 */

export const MAX_TITLE = 80;
export const MAX_BODY = 2000;
export const MAX_SYMBOL = 20;
export const MAX_LINKS = 5;
export const MAX_LINK_LABEL = 40;
export const MAX_LINK_URL = 300;
/**
 * Global cap on open (non-canceled) announcements — the store-wide DoS
 * backstop behind the per-operator caps. Checked on POST and PATCH reopen.
 */
export const MAX_ANNOUNCEMENTS = 1_000;

/**
 * Per-operator cap on open (non-canceled) announcements. Writes are SIWE
 * authenticated, so this bounds how much board space one wallet can occupy;
 * the global MAX_ANNOUNCEMENTS above stays as the backstop. Enforced on POST
 * and on PATCH reopen (a canceled→open transition takes a slot).
 */
export const MAX_OPEN_PER_OPERATOR = 20;

/**
 * Lifetime per-operator cap on TOTAL rows, canceled included. The open cap
 * alone doesn't bound storage — a create→cancel loop grows tombstones
 * forever — so each wallet also gets a hard row budget.
 */
export const MAX_TOTAL_PER_OPERATOR = 100;

/**
 * External links must be secure web URLs — a public board must not send
 * claimers to plain-http pages (no javascript:/data:/http:// schemes). The
 * localhost forms stay allowed so dev-fork announcements can link local
 * pages.
 */
// The port must be digits-only: a permissive `:` branch would accept
// userinfo tricks like http://localhost:1@evil.com (real host: evil.com).
export const LINK_URL_RE = /^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?([/?#]|$)/i;
