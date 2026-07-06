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
  return d.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

/**
 * Fold long content lines at 75 octets (RFC 5545 §3.1) — some parsers reject
 * unfolded long DESCRIPTIONs. Counts UTF-8 octets, not characters (a Korean
 * title is 3 bytes per syllable), and never splits inside a character.
 * Continuation lines start with a space (which costs one octet).
 */
const encoder = new TextEncoder();

function fold(line: string): string {
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

export type CalendarEvent = {
  /** Stable unique id (e.g. the announcement id). */
  uid: string;
  title: string;
  description?: string;
  start: Date;
  /** Defaults to start + 1h when the announcement has no expected end. */
  end?: Date;
  url?: string;
};

/** Google/Outlook (and DTEND) require an end; announcements may omit one. */
function eventEnd(event: CalendarEvent): Date {
  return event.end ?? new Date(event.start.getTime() + 60 * 60 * 1000);
}

/** description + event URL as the free-text body web calendars display. */
function eventDetails(event: CalendarEvent): string {
  return [event.description, event.url].filter(Boolean).join("\n\n");
}

/** "Add event" template URL for Google Calendar (opens prefilled composer). */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${icsUtc(event.start)}/${icsUtc(eventEnd(event))}`,
    details: eventDetails(event),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** "Add event" compose URL for Outlook.com (personal accounts). */
export function outlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: event.start.toISOString(),
    enddt: eventEnd(event).toISOString(),
    body: eventDetails(event),
  });
  return `https://outlook.live.com/calendar/0/action/compose?${params}`;
}

export function buildIcs(event: CalendarEvent): string {
  const end = eventEnd(event);
  const details = eventDetails(event);
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
    // Same description + event-URL text the web-calendar builders send —
    // clients that ignore the URL property still surface the link.
    ...(details ? [fold(`DESCRIPTION:${icsEscape(details)}`)] : []),
    // URL is a URI value type (§3.3.13) — no §3.3.11 backslash escaping, or
    // commas/semicolons in query strings would corrupt the link. Newlines
    // stripped: they can't appear in a valid URI and would break the line.
    ...(event.url ? [fold(`URL:${event.url.replace(/[\r\n]/g, "")}`)] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
