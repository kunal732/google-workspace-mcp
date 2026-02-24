import { getAccessToken } from "./auth.js";

const CHAT_BASE = "https://chat.googleapis.com/v1";

interface Space {
  name: string;
  displayName?: string;
  type: string;
  singleUserBotDm?: boolean;
}

interface Message {
  name: string;
  sender?: { displayName?: string; type?: string };
  createTime: string;
  text?: string;
}

export async function listSpaces(): Promise<string> {
  const token = await getAccessToken();

  const res = await fetch(`${CHAT_BASE}/spaces`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat API error ${res.status}: ${text}`);
  }

  const data: { spaces?: Space[] } = await res.json();
  if (!data.spaces?.length) {
    return "No Chat spaces found.";
  }

  const lines = data.spaces.map(
    (s) => `- "${s.displayName || "(unnamed)"}" (${s.type}, id: ${s.name})`
  );
  return `Chat Spaces (${data.spaces.length}):\n${lines.join("\n")}`;
}

export async function listMessages(spaceName: string, maxResults: number = 20): Promise<string> {
  const token = await getAccessToken();

  const params = new URLSearchParams({
    pageSize: String(maxResults),
    orderBy: "createTime desc",
  });

  const res = await fetch(`${CHAT_BASE}/${spaceName}/messages?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat API error ${res.status}: ${text}`);
  }

  const data: { messages?: Message[] } = await res.json();
  if (!data.messages?.length) {
    return "No messages found.";
  }

  const lines = data.messages.map((m) => {
    const sender = m.sender?.displayName || "Unknown";
    const time = m.createTime;
    const text = m.text || "(no text)";
    return `[${time}] ${sender}: ${text}`;
  });

  return `Messages:\n\n${lines.join("\n")}`;
}
