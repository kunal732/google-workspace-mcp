import { getAccessToken } from "./auth.js";

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: Array<{ email: string; responseStatus?: string }>;
  organizer?: { email: string; displayName?: string };
  htmlLink?: string;
  status?: string;
}

interface EventsResponse {
  items: CalendarEvent[];
  summary?: string;
}

export async function listEvents(
  daysAhead: number = 7,
  calendarId: string = "primary",
  maxResults: number = 20
): Promise<string> {
  const token = await getAccessToken();

  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(maxResults),
  });

  const res = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-goog-user-project": "datadog-community",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calendar API error ${res.status}: ${text}`);
  }

  const data: EventsResponse = await res.json();

  if (!data.items?.length) {
    return `No events found in the next ${daysAhead} day(s).`;
  }

  const lines = data.items.map((ev) => {
    const start = ev.start.dateTime || ev.start.date || "unknown";
    const end = ev.end.dateTime || ev.end.date || "";
    let line = `- ${ev.summary || "(no title)"}\n  When: ${start}${end ? ` to ${end}` : ""}`;
    if (ev.location) line += `\n  Location: ${ev.location}`;
    return line;
  });

  return `Calendar: ${data.summary || calendarId}\nEvents (next ${daysAhead} days):\n\n${lines.join("\n\n")}`;
}

export async function readEvent(eventId: string, calendarId: string = "primary"): Promise<string> {
  const token = await getAccessToken();

  const res = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-goog-user-project": "datadog-community",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calendar API error ${res.status}: ${text}`);
  }

  const ev: CalendarEvent = await res.json();
  const start = ev.start.dateTime || ev.start.date || "unknown";
  const end = ev.end.dateTime || ev.end.date || "";

  let output = `Event: ${ev.summary || "(no title)"}`;
  output += `\nWhen: ${start}${end ? ` to ${end}` : ""}`;
  if (ev.location) output += `\nLocation: ${ev.location}`;
  if (ev.organizer) output += `\nOrganizer: ${ev.organizer.displayName || ev.organizer.email}`;
  if (ev.description) output += `\nDescription: ${ev.description}`;
  if (ev.attendees?.length) {
    output += `\nAttendees:\n${ev.attendees.map((a) => `  - ${a.email} (${a.responseStatus || "unknown"})`).join("\n")}`;
  }
  if (ev.htmlLink) output += `\nLink: ${ev.htmlLink}`;

  return output;
}
