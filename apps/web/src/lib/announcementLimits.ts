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
 * Per-operator cap on open (non-canceled) announcements. Writes are SIWE
 * authenticated, so this bounds how much board space one wallet can occupy;
 * the global MAX_ANNOUNCEMENTS in the route stays as the backstop.
 */
export const MAX_OPEN_PER_OPERATOR = 20;

/**
 * External links must be secure web URLs — a public board must not send
 * claimers to plain-http pages (no javascript:/data:/http:// schemes). The
 * localhost forms stay allowed so dev-fork announcements can link local
 * pages.
 */
export const LINK_URL_RE = /^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i;
