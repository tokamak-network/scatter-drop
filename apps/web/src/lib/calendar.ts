/**
 * Minimal RFC 5545 (.ics) event builder for announcement "add to calendar".
 * One VEVENT, UTC times — enough for Google/Apple/Outlook imports without a
 * calendar dependency.
 */

/** Escape per RFC 5545 §3.3.11 (backslash, semicolon, comma, any newline). */
function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Date → "YYYYMMDDTHHMMSSZ" (UTC basic format). */
function icsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Fold long content lines at 75 octets (RFC 5545 §3.1) — some parsers reject
 * unfolded long DESCRIPTIONs. Counts UTF-8 octets, not characters (a Korean
 * title is 3 bytes per syllable), and never splits inside a character.
 * Continuation lines start with a space (which costs one octet).
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    // 74 for the first line, 73 for continuations (leading space = 1 octet).
    const limit = out.length === 0 ? 74 : 73;
    if (currentBytes + chBytes > limit) {
      out.push(current);
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += chBytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(event: {
  /** Stable unique id (e.g. the announcement id). */
  uid: string;
  title: string;
  description?: string;
  start: Date;
  /** Defaults to start + 1h when the announcement has no expected end. */
  end?: Date;
  url?: string;
}): string {
  const end = event.end ?? new Date(event.start.getTime() + 60 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//scatter.drop//announcement//EN",
    "BEGIN:VEVENT",
    fold(`UID:${icsEscape(event.uid)}@scatter.drop`),
    `DTSTAMP:${icsUtc(new Date())}`,
    `DTSTART:${icsUtc(event.start)}`,
    `DTEND:${icsUtc(end)}`,
    fold(`SUMMARY:${icsEscape(event.title)}`),
    ...(event.description ? [fold(`DESCRIPTION:${icsEscape(event.description)}`)] : []),
    // URL is a URI value type (§3.3.13) — no §3.3.11 backslash escaping, or
    // commas/semicolons in query strings would corrupt the link. Newlines
    // stripped: they can't appear in a valid URI and would break the line.
    ...(event.url ? [fold(`URL:${event.url.replace(/[\r\n]/g, "")}`)] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
