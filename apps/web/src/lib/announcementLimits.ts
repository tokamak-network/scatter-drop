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

/** External links must be web URLs (no javascript:/data: schemes). */
export const LINK_URL_RE = /^https?:\/\//i;
