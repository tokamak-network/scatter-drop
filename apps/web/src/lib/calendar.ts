/**
 * Minimal RFC 5545 (.ics) event builder for announcement "add to calendar".
 * One VEVENT, UTC times — enough for Google/Apple/Outlook imports without a
 * calendar dependency.
 */

/** Escape per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline). */
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Date → "YYYYMMDDTHHMMSSZ" (UTC basic format). */
function icsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Fold long content lines at 75 octets (RFC 5545 §3.1) — some parsers reject
 * unfolded long DESCRIPTIONs. Continuation lines start with a space.
 */
function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 74) out.push(line.slice(i, i + 74));
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
    ...(event.url ? [fold(`URL:${icsEscape(event.url)}`)] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
