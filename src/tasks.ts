import { getAccessToken } from "./auth.js";

const TASKS_BASE = "https://tasks.googleapis.com/tasks/v1";

interface TaskList {
  id: string;
  title: string;
}

interface TaskItem {
  id: string;
  title: string;
  notes?: string;
  status: string;
  due?: string;
  updated: string;
}

export async function listTaskLists(): Promise<string> {
  const token = await getAccessToken();

  const res = await fetch(`${TASKS_BASE}/users/@me/lists`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tasks API error ${res.status}: ${text}`);
  }

  const data: { items?: TaskList[] } = await res.json();
  if (!data.items?.length) {
    return "No task lists found.";
  }

  const lines = data.items.map((l) => `- "${l.title}" (id: ${l.id})`);
  return `Task Lists (${data.items.length}):\n${lines.join("\n")}`;
}

export async function listTasks(taskListId: string = "@default", maxResults: number = 20): Promise<string> {
  const token = await getAccessToken();

  const params = new URLSearchParams({
    maxResults: String(maxResults),
    showCompleted: "false",
  });

  const res = await fetch(`${TASKS_BASE}/lists/${encodeURIComponent(taskListId)}/tasks?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tasks API error ${res.status}: ${text}`);
  }

  const data: { items?: TaskItem[] } = await res.json();
  if (!data.items?.length) {
    return "No tasks found.";
  }

  const lines = data.items.map((t) => {
    let line = `- ${t.title || "(untitled)"} [${t.status}]`;
    if (t.due) line += ` (due: ${t.due})`;
    if (t.notes) line += `\n  Notes: ${t.notes}`;
    return line;
  });

  return `Tasks (${data.items.length}):\n\n${lines.join("\n")}`;
}
