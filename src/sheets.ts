import { getAccessToken } from "./auth.js";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

interface SheetProperties {
  sheetId: number;
  title: string;
  index: number;
}

interface Sheet {
  properties: SheetProperties;
}

interface Spreadsheet {
  properties: { title: string };
  sheets: Sheet[];
}

export async function listSheets(spreadsheetId: string): Promise<string> {
  const token = await getAccessToken();

  const res = await fetch(`${SHEETS_BASE}/${spreadsheetId}?fields=properties.title,sheets.properties`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API error ${res.status}: ${text}`);
  }

  const data: Spreadsheet = await res.json();
  const lines = data.sheets.map(
    (s) => `- "${s.properties.title}" (sheetId: ${s.properties.sheetId})`
  );

  return `Title: ${data.properties.title}\nSheets (${data.sheets.length}):\n${lines.join("\n")}`;
}

export async function read(spreadsheetId: string, range?: string): Promise<string> {
  const token = await getAccessToken();

  // First get the spreadsheet metadata to know the title
  const metaRes = await fetch(`${SHEETS_BASE}/${spreadsheetId}?fields=properties.title,sheets.properties`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });

  if (!metaRes.ok) {
    const text = await metaRes.text();
    throw new Error(`Sheets API error ${metaRes.status}: ${text}`);
  }

  const meta: Spreadsheet = await metaRes.json();

  // Default to first sheet if no range specified
  const queryRange = range || meta.sheets[0]?.properties.title || "Sheet1";

  const res = await fetch(
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(queryRange)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-goog-user-project": "datadog-community",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API error ${res.status}: ${text}`);
  }

  const data: { range: string; values?: string[][] } = await res.json();
  if (!data.values?.length) {
    return `Title: ${meta.properties.title}\nRange: ${data.range}\n\n(empty)`;
  }

  const rows = data.values.map((row) => row.join("\t")).join("\n");
  return `Title: ${meta.properties.title}\nRange: ${data.range}\n\n${rows}`;
}
