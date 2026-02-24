import { getAccessToken } from "./auth.js";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessageMetadata {
  id: string;
  threadId: string;
  payload: {
    headers: GmailHeader[];
    mimeType: string;
    body?: { data?: string; size: number };
    parts?: GmailMessagePart[];
  };
  snippet: string;
  internalDate: string;
}

interface GmailMessagePart {
  mimeType: string;
  body?: { data?: string; size: number };
  parts?: GmailMessagePart[];
}

function getHeader(headers: GmailHeader[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractTextBody(part: GmailMessagePart): string {
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  if (part.parts) {
    for (const sub of part.parts) {
      const text = extractTextBody(sub);
      if (text) return text;
    }
  }
  // Fall back to HTML if no plain text
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  return "";
}

async function gmailFetch(path: string, token: string): Promise<any> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function search(
  query: string,
  maxResults: number = 10
): Promise<string> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });

  const listData = await gmailFetch(`/messages?${params}`, token);

  if (!listData.messages || listData.messages.length === 0) {
    return "No messages found.";
  }

  const results: string[] = [];

  for (const msg of listData.messages) {
    const detail: GmailMessageMetadata = await gmailFetch(
      `/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      token
    );

    const subject = getHeader(detail.payload.headers, "Subject") || "(no subject)";
    const from = getHeader(detail.payload.headers, "From");
    const date = getHeader(detail.payload.headers, "Date");

    results.push(
      `ID: ${msg.id}\nFrom: ${from}\nDate: ${date}\nSubject: ${subject}\n`
    );
  }

  return results.join("\n---\n");
}

export async function read(messageId: string): Promise<string> {
  const token = await getAccessToken();

  const detail: GmailMessageMetadata = await gmailFetch(
    `/messages/${messageId}?format=full`,
    token
  );

  const headers = detail.payload.headers;
  const subject = getHeader(headers, "Subject") || "(no subject)";
  const from = getHeader(headers, "From");
  const to = getHeader(headers, "To");
  const date = getHeader(headers, "Date");

  let body = "";
  if (detail.payload.body?.data) {
    body = decodeBase64Url(detail.payload.body.data);
  } else if (detail.payload.parts) {
    body = extractTextBody({ mimeType: detail.payload.mimeType, parts: detail.payload.parts });
  }

  if (!body) {
    body = detail.snippet || "(empty message)";
  }

  return `Subject: ${subject}\nFrom: ${from}\nTo: ${to}\nDate: ${date}\n\n${body}`;
}
