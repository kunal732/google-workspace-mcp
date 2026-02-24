import { getAccessToken } from "./auth.js";

const PEOPLE_BASE = "https://people.googleapis.com/v1";

interface Person {
  resourceName: string;
  names?: Array<{ displayName: string }>;
  emailAddresses?: Array<{ value: string; type?: string }>;
  phoneNumbers?: Array<{ value: string; type?: string }>;
  organizations?: Array<{ name?: string; title?: string }>;
}

interface ConnectionsResponse {
  connections?: Person[];
  totalPeople?: number;
}

interface SearchResponse {
  results?: Array<{ person: Person }>;
}

function formatPerson(p: Person): string {
  const name = p.names?.[0]?.displayName || "(no name)";
  const parts = [name];

  if (p.organizations?.length) {
    const org = p.organizations[0];
    if (org.title && org.name) parts.push(`  Role: ${org.title} at ${org.name}`);
    else if (org.name) parts.push(`  Org: ${org.name}`);
    else if (org.title) parts.push(`  Role: ${org.title}`);
  }

  if (p.emailAddresses?.length) {
    parts.push(`  Email: ${p.emailAddresses.map((e) => e.value).join(", ")}`);
  }

  if (p.phoneNumbers?.length) {
    parts.push(`  Phone: ${p.phoneNumbers.map((ph) => ph.value).join(", ")}`);
  }

  return parts.join("\n");
}

const PERSON_FIELDS = "names,emailAddresses,phoneNumbers,organizations";

export async function search(query: string, maxResults: number = 10): Promise<string> {
  const token = await getAccessToken();

  const params = new URLSearchParams({
    query,
    readMask: PERSON_FIELDS,
    pageSize: String(maxResults),
  });

  const res = await fetch(`${PEOPLE_BASE}/people:searchContacts?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`People API error ${res.status}: ${text}`);
  }

  const data: SearchResponse = await res.json();
  if (!data.results?.length) {
    return `No contacts found for "${query}".`;
  }

  const lines = data.results.map((r) => formatPerson(r.person));
  return `Contacts matching "${query}":\n\n${lines.join("\n\n")}`;
}

export async function list(maxResults: number = 20): Promise<string> {
  const token = await getAccessToken();

  const params = new URLSearchParams({
    personFields: PERSON_FIELDS,
    pageSize: String(maxResults),
    sortOrder: "LAST_MODIFIED_DESCENDING",
  });

  const res = await fetch(`${PEOPLE_BASE}/people/me/connections?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`People API error ${res.status}: ${text}`);
  }

  const data: ConnectionsResponse = await res.json();
  if (!data.connections?.length) {
    return "No contacts found.";
  }

  const lines = data.connections.map(formatPerson);
  return `Contacts (${data.connections.length}):\n\n${lines.join("\n\n")}`;
}
