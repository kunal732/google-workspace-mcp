import { getAccessToken } from "./auth.js";

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

interface DriveFileList {
  files: DriveFile[];
}

const MIME_TYPE_MAP: Record<string, string> = {
  docs: "application/vnd.google-apps.document",
  sheets: "application/vnd.google-apps.spreadsheet",
  slides: "application/vnd.google-apps.presentation",
};

function formatMimeType(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.document") return "Google Doc";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "Google Sheet";
  if (mimeType === "application/vnd.google-apps.presentation") return "Google Slides";
  if (mimeType === "application/vnd.google-apps.folder") return "Folder";
  return mimeType;
}

async function driveFetch(path: string, token: string): Promise<any> {
  const res = await fetch(`${DRIVE_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API error ${res.status}: ${text}`);
  }
  return res.json();
}

function formatFileList(files: DriveFile[]): string {
  if (!files || files.length === 0) {
    return "No files found.";
  }

  return files
    .map(
      (f) =>
        `Name: ${f.name}\nID: ${f.id}\nType: ${formatMimeType(f.mimeType)}\nModified: ${f.modifiedTime}\n`
    )
    .join("\n---\n");
}

export async function search(query: string, maxResults: number = 10): Promise<string> {
  const token = await getAccessToken();

  const driveQuery = `name contains '${query.replace(/'/g, "\\'")}'`;
  const params = new URLSearchParams({
    q: driveQuery,
    pageSize: String(maxResults),
    fields: "files(id,name,mimeType,modifiedTime)",
    orderBy: "modifiedTime desc",
  });

  const data: DriveFileList = await driveFetch(`/files?${params}`, token);
  return formatFileList(data.files);
}

export async function list(
  fileType?: string,
  maxResults: number = 10
): Promise<string> {
  const token = await getAccessToken();

  const params = new URLSearchParams({
    pageSize: String(maxResults),
    fields: "files(id,name,mimeType,modifiedTime)",
    orderBy: "modifiedTime desc",
  });

  if (fileType && MIME_TYPE_MAP[fileType]) {
    params.set("q", `mimeType = '${MIME_TYPE_MAP[fileType]}'`);
  }

  const data: DriveFileList = await driveFetch(`/files?${params}`, token);
  return formatFileList(data.files);
}
