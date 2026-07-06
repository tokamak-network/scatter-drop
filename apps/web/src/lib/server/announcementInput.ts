import {
  LINK_URL_RE,
  MAX_BODY,
  MAX_LINK_LABEL,
  MAX_LINK_URL,
  MAX_LINKS,
  MAX_SYMBOL,
  MAX_TITLE,
  sanitizeSymbol,
} from "@/lib/announcementLimits";
import { isChainId, LOWER_ADDR_RE } from "./apiInput";

/**
 * Input validation for the announcements store (POST create / PATCH update).
 * Kept beside networkInput/apiInput so the routes stay thin auth + persistence
 * layers. Field caps live in lib/announcementLimits (shared with the form).
 */

export type AnnouncementLink = { label: string; url: string };

export type AnnouncementInput = {
  chainId: number;
  title: string;
  body: string;
  tokenSymbol: string | null;
  tokenAddress: string | null; // lowercased ERC-20 address of the airdropped token
  expectedStart: Date;
  expectedEnd: Date | null;
  links: string | null; // JSON-serialized AnnouncementLink[]
};

type Result<T> = { value: T } | { error: string };

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Required trimmed string within `max` chars. */
function parseText(v: unknown, field: string, max: number): Result<string> {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > max) return { error: `${field} required (max ${max} chars)` };
  return { value: s };
}

/** Sanitize the external-links array; only http(s) URLs survive. */
function parseLinks(v: unknown): Result<string | null> {
  if (v === undefined || v === null) return { value: null };
  if (!Array.isArray(v) || v.length > MAX_LINKS) {
    return { error: `links must be an array of at most ${MAX_LINKS}` };
  }
  const links: AnnouncementLink[] = [];
  for (const item of v) {
    const { label, url } = (item ?? {}) as { label?: unknown; url?: unknown };
    if (
      typeof label !== "string" ||
      !label.trim() ||
      label.length > MAX_LINK_LABEL ||
      typeof url !== "string" ||
      url.length > MAX_LINK_URL ||
      !LINK_URL_RE.test(url)
    ) {
      return { error: "each link needs a label and an https:// url (http is allowed for localhost only)" };
    }
    links.push({ label: label.trim(), url });
  }
  return { value: links.length ? JSON.stringify(links) : null };
}

/** The announced-window rule; also used by PATCH against merged values. */
export function windowError(start: Date, end: Date | null): string | null {
  return end && end <= start ? "expectedEnd must be after expectedStart" : null;
}

export type AnnouncementPatch = Partial<Omit<AnnouncementInput, "chainId">> & {
  drop?: string | null;
  canceled?: boolean;
};

/**
 * Validate a partial update — only fields present in the payload are returned.
 * `drop` links the announcement to a created campaign, `canceled` closes it.
 * The create parser reuses this per-field logic (single source of the rules);
 * the caller cross-checks the window with `windowError` against merged values.
 */
export function parseAnnouncementPatch(body: unknown): Result<AnnouncementPatch> {
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: AnnouncementPatch = {};
  if (b.title !== undefined) {
    const title = parseText(b.title, "title", MAX_TITLE);
    if ("error" in title) return title;
    patch.title = title.value;
  }
  if (b.body !== undefined) {
    const text = parseText(b.body, "body", MAX_BODY);
    if ("error" in text) return text;
    patch.body = text.value;
  }
  if (b.tokenSymbol !== undefined) {
    // Sanitize BEFORE the length check: stripping zero-width/bidi padding is
    // what makes the cap meaningful (else a symbol could pad under the limit
    // with invisible chars, or overflow it with them).
    const s = typeof b.tokenSymbol === "string" ? sanitizeSymbol(b.tokenSymbol) : "";
    if (s.length > MAX_SYMBOL) return { error: `tokenSymbol too long (max ${MAX_SYMBOL} chars)` };
    patch.tokenSymbol = s || null;
  }
  if (b.tokenAddress !== undefined) {
    // Only a string (or explicit null to clear) is accepted — coercing a
    // non-string to "clear" would silently mask client bugs on PATCH.
    if (b.tokenAddress !== null && typeof b.tokenAddress !== "string") {
      return { error: "Invalid tokenAddress" };
    }
    const s = (b.tokenAddress ?? "").trim().toLowerCase();
    if (s && !LOWER_ADDR_RE.test(s)) return { error: "Invalid tokenAddress" };
    patch.tokenAddress = s || null;
  }
  if (b.expectedStart !== undefined) {
    const d = parseDate(b.expectedStart);
    if (!d) return { error: "Invalid expectedStart" };
    patch.expectedStart = d;
  }
  if (b.expectedEnd !== undefined) {
    if (b.expectedEnd === null) patch.expectedEnd = null;
    else {
      const d = parseDate(b.expectedEnd);
      if (!d) return { error: "Invalid expectedEnd" };
      patch.expectedEnd = d;
    }
  }
  if (b.links !== undefined) {
    const links = parseLinks(b.links);
    if ("error" in links) return links;
    patch.links = links.value;
  }
  if (b.drop !== undefined) {
    if (b.drop === null) patch.drop = null;
    else {
      const drop = typeof b.drop === "string" ? b.drop.toLowerCase() : "";
      if (!LOWER_ADDR_RE.test(drop)) return { error: "Invalid drop address" };
      patch.drop = drop;
    }
  }
  if (b.canceled !== undefined) {
    if (typeof b.canceled !== "boolean") return { error: "canceled must be a boolean" };
    patch.canceled = b.canceled;
  }
  if (Object.keys(patch).length === 0) return { error: "No fields to update" };
  return { value: patch };
}

/** Validate a full create payload: the patch rules + required fields + chainId. */
export function parseAnnouncement(body: unknown): Result<AnnouncementInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isChainId(b.chainId)) return { error: "Invalid chainId" };
  // Presence first, so the per-field parser then guarantees validity.
  if (b.title === undefined) return { error: `title required (max ${MAX_TITLE} chars)` };
  if (b.body === undefined) return { error: `body required (max ${MAX_BODY} chars)` };
  if (typeof b.expectedStart !== "string" || !b.expectedStart) {
    return { error: "expectedStart (ISO datetime) required" };
  }
  const patch = parseAnnouncementPatch({
    title: b.title,
    body: b.body,
    tokenSymbol: b.tokenSymbol,
    tokenAddress: b.tokenAddress,
    expectedStart: b.expectedStart,
    expectedEnd: b.expectedEnd,
    links: b.links,
  });
  if ("error" in patch) return patch;
  const v = patch.value;
  if (!v.title || !v.body || !v.expectedStart) return { error: "Invalid announcement" };
  const expectedEnd = v.expectedEnd ?? null;
  const windowErr = windowError(v.expectedStart, expectedEnd);
  if (windowErr) return { error: windowErr };
  return {
    value: {
      chainId: b.chainId,
      title: v.title,
      body: v.body,
      tokenSymbol: v.tokenSymbol ?? null,
      tokenAddress: v.tokenAddress ?? null,
      expectedStart: v.expectedStart,
      expectedEnd,
      links: v.links ?? null,
    },
  };
}

/** DB row → API shape: the links JSON string becomes a structured array. */
export function announcementDto<
  T extends { links: string | null },
>(row: T): Omit<T, "links"> & { links: AnnouncementLink[] } {
  let links: AnnouncementLink[] = [];
  if (row.links) {
    try {
      links = JSON.parse(row.links) as AnnouncementLink[];
    } catch {
      /* corrupt row — hide the links rather than 500 the list */
    }
  }
  return { ...row, links };
}
