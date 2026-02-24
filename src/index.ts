import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as gmail from "./gmail.js";
import * as drive from "./drive.js";
import * as docs from "./docs.js";
import * as sheets from "./sheets.js";
import * as slides from "./slides.js";
import * as calendar from "./calendar.js";
import * as contacts from "./contacts.js";
import * as tasks from "./tasks.js";
import * as forms from "./forms.js";
import * as chat from "./chat.js";

const server = new McpServer({
  name: "google-workspace",
  version: "1.0.0",
});

// --- Gmail tools ---

server.tool(
  "gmail_search",
  "Search emails by query (e.g. `is:unread newer_than:1d`). Returns subject, from, date for each match.",
  {
    query: z.string().describe("Gmail search query"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Maximum number of results to return"),
  },
  async ({ query, maxResults }) => {
    const result = await gmail.search(query, maxResults);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.tool(
  "gmail_read",
  "Read full email by message ID. Returns subject, from, to, date, body text.",
  {
    messageId: z.string().describe("Gmail message ID"),
  },
  async ({ messageId }) => {
    const result = await gmail.read(messageId);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Drive tools ---

server.tool(
  "drive_search",
  "Search Drive files by name or query. Returns file name, ID, type, modified date.",
  {
    query: z.string().describe("Search term to match against file names"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Maximum number of results to return"),
  },
  async ({ query, maxResults }) => {
    const result = await drive.search(query, maxResults);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.tool(
  "drive_list",
  "List recent files, optional type filter (docs, sheets, slides).",
  {
    fileType: z
      .enum(["docs", "sheets", "slides"])
      .optional()
      .describe("Filter by file type: docs, sheets, or slides"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Maximum number of results to return"),
  },
  async ({ fileType, maxResults }) => {
    const result = await drive.list(fileType, maxResults);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Docs tools ---

server.tool(
  "docs_list_tabs",
  "List all tabs in a Google Doc. Returns tab titles and IDs.",
  {
    documentId: z.string().describe("Google Docs document ID"),
  },
  async ({ documentId }) => {
    const result = await docs.listTabs(documentId);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.tool(
  "docs_read",
  "Read full text content of a Google Doc by document ID. Optionally specify a tabId to read a specific tab.",
  {
    documentId: z.string().describe("Google Docs document ID"),
    tabId: z.string().optional().describe("Tab ID to read (from docs_list_tabs). If omitted, reads the default tab."),
  },
  async ({ documentId, tabId }) => {
    const result = await docs.read(documentId, tabId);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Sheets tools ---

server.tool(
  "sheets_list",
  "List all sheets (tabs) in a Google Spreadsheet. Returns sheet names and IDs.",
  {
    spreadsheetId: z.string().describe("Google Sheets spreadsheet ID"),
  },
  async ({ spreadsheetId }) => {
    const result = await sheets.listSheets(spreadsheetId);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.tool(
  "sheets_read",
  "Read cell data from a Google Spreadsheet. Specify a range like 'Sheet1!A1:D10' or just 'Sheet1'.",
  {
    spreadsheetId: z.string().describe("Google Sheets spreadsheet ID"),
    range: z.string().optional().describe("A1 notation range (e.g. 'Sheet1!A1:D10'). Defaults to first sheet."),
  },
  async ({ spreadsheetId, range }) => {
    const result = await sheets.read(spreadsheetId, range);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Slides tools ---

server.tool(
  "slides_read",
  "Read all text content and speaker notes from a Google Slides presentation.",
  {
    presentationId: z.string().describe("Google Slides presentation ID"),
  },
  async ({ presentationId }) => {
    const result = await slides.read(presentationId);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Calendar tools ---

server.tool(
  "calendar_list_events",
  "List upcoming calendar events. Defaults to next 7 days on primary calendar.",
  {
    daysAhead: z.number().int().min(1).max(90).default(7).describe("Number of days to look ahead"),
    calendarId: z.string().default("primary").describe("Calendar ID (default: primary)"),
    maxResults: z.number().int().min(1).max(50).default(20).describe("Maximum number of events"),
  },
  async ({ daysAhead, calendarId, maxResults }) => {
    const result = await calendar.listEvents(daysAhead, calendarId, maxResults);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.tool(
  "calendar_read_event",
  "Read full details of a specific calendar event by event ID.",
  {
    eventId: z.string().describe("Calendar event ID"),
    calendarId: z.string().default("primary").describe("Calendar ID (default: primary)"),
  },
  async ({ eventId, calendarId }) => {
    const result = await calendar.readEvent(eventId, calendarId);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Contacts tools ---

server.tool(
  "contacts_search",
  "Search Google Contacts by name, email, or other query.",
  {
    query: z.string().describe("Search query (name, email, etc.)"),
    maxResults: z.number().int().min(1).max(50).default(10).describe("Maximum number of results"),
  },
  async ({ query, maxResults }) => {
    const result = await contacts.search(query, maxResults);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.tool(
  "contacts_list",
  "List recent Google Contacts.",
  {
    maxResults: z.number().int().min(1).max(50).default(20).describe("Maximum number of results"),
  },
  async ({ maxResults }) => {
    const result = await contacts.list(maxResults);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Tasks tools ---

server.tool(
  "tasks_list_tasklists",
  "List all Google Task lists.",
  {},
  async () => {
    const result = await tasks.listTaskLists();
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.tool(
  "tasks_list",
  "List tasks in a Google Task list.",
  {
    taskListId: z.string().default("@default").describe("Task list ID (from tasks_list_tasklists). Defaults to primary list."),
    maxResults: z.number().int().min(1).max(50).default(20).describe("Maximum number of tasks"),
  },
  async ({ taskListId, maxResults }) => {
    const result = await tasks.listTasks(taskListId, maxResults);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Forms tools ---

server.tool(
  "forms_read",
  "Read a Google Form's structure (title, questions, options).",
  {
    formId: z.string().describe("Google Form ID"),
  },
  async ({ formId }) => {
    const result = await forms.readForm(formId);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.tool(
  "forms_list_responses",
  "List responses submitted to a Google Form.",
  {
    formId: z.string().describe("Google Form ID"),
    maxResults: z.number().int().min(1).max(50).default(20).describe("Maximum number of responses"),
  },
  async ({ formId, maxResults }) => {
    const result = await forms.listResponses(formId, maxResults);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Chat tools ---

server.tool(
  "chat_list_spaces",
  "List Google Chat spaces the user is a member of.",
  {},
  async () => {
    const result = await chat.listSpaces();
    return { content: [{ type: "text" as const, text: result }] };
  }
);

server.tool(
  "chat_list_messages",
  "List recent messages in a Google Chat space.",
  {
    spaceName: z.string().describe("Chat space resource name (e.g. 'spaces/AAAA')"),
    maxResults: z.number().int().min(1).max(50).default(20).describe("Maximum number of messages"),
  },
  async ({ spaceName, maxResults }) => {
    const result = await chat.listMessages(spaceName, maxResults);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// --- Start server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Workspace MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
