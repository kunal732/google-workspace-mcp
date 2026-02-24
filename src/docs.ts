import { getAccessToken } from "./auth.js";

const DOCS_BASE = "https://docs.googleapis.com/v1/documents";

interface DocsStructuralElement {
  paragraph?: {
    elements: Array<{
      textRun?: { content: string };
    }>;
  };
  table?: {
    tableRows: Array<{
      tableCells: Array<{
        content: DocsStructuralElement[];
      }>;
    }>;
  };
  sectionBreak?: object;
}

interface DocsTab {
  tabProperties: {
    tabId: string;
    title: string;
    index: number;
  };
  documentTab?: {
    body: {
      content: DocsStructuralElement[];
    };
  };
  childTabs?: DocsTab[];
}

interface DocsDocument {
  title: string;
  body: {
    content: DocsStructuralElement[];
  };
  tabs?: DocsTab[];
}

function extractText(elements: DocsStructuralElement[]): string {
  const parts: string[] = [];

  for (const el of elements) {
    if (el.paragraph) {
      for (const pe of el.paragraph.elements) {
        if (pe.textRun?.content) {
          parts.push(pe.textRun.content);
        }
      }
    } else if (el.table) {
      for (const row of el.table.tableRows) {
        const cells = row.tableCells.map((cell) => extractText(cell.content).trim());
        parts.push(cells.join("\t") + "\n");
      }
    }
  }

  return parts.join("");
}

function flattenTabs(tabs: DocsTab[]): DocsTab[] {
  const result: DocsTab[] = [];
  for (const tab of tabs) {
    result.push(tab);
    if (tab.childTabs?.length) {
      result.push(...flattenTabs(tab.childTabs));
    }
  }
  return result;
}

export async function listTabs(documentId: string): Promise<string> {
  const token = await getAccessToken();

  const res = await fetch(
    `${DOCS_BASE}/${documentId}?includeTabsContent=true`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-goog-user-project": "datadog-community",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Docs API error ${res.status}: ${text}`);
  }

  const doc: DocsDocument = await res.json();
  const allTabs = flattenTabs(doc.tabs ?? []);

  const lines = allTabs.map(
    (t) => `- "${t.tabProperties.title}" (tabId: ${t.tabProperties.tabId})`
  );

  return `Title: ${doc.title}\nTabs (${allTabs.length}):\n${lines.join("\n")}`;
}

export async function read(documentId: string, tabId?: string): Promise<string> {
  const token = await getAccessToken();

  const url = tabId
    ? `${DOCS_BASE}/${documentId}?includeTabsContent=true`
    : `${DOCS_BASE}/${documentId}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Docs API error ${res.status}: ${text}`);
  }

  const doc: DocsDocument = await res.json();

  if (tabId && doc.tabs) {
    const allTabs = flattenTabs(doc.tabs);
    const tab = allTabs.find((t) => t.tabProperties.tabId === tabId);
    if (!tab) {
      const available = allTabs.map((t) => `"${t.tabProperties.title}" (${t.tabProperties.tabId})`).join(", ");
      throw new Error(`Tab "${tabId}" not found. Available tabs: ${available}`);
    }
    const content = tab.documentTab?.body ? extractText(tab.documentTab.body.content) : "(empty tab)";
    return `Title: ${doc.title}\nTab: ${tab.tabProperties.title}\n\n${content}`;
  }

  const content = extractText(doc.body.content);
  return `Title: ${doc.title}\n\n${content}`;
}
