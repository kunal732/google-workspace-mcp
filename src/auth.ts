import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import open from "open";

const CLOUD_RUN_URL = "https://google-workspace-mcp-1036979431900.us-central1.run.app";

const TOKEN_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".google-workspace-mcp"
);
const TOKEN_PATH = path.join(TOKEN_DIR, "tokens.json");

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

let cachedTokens: StoredTokens | null = null;

function loadTokens(): StoredTokens | null {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8")) as StoredTokens;
    }
  } catch {
    // Corrupted token file — will re-auth
  }
  return null;
}

function saveTokens(tokens: StoredTokens): void {
  fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

async function refreshTokens(refresh_token: string): Promise<StoredTokens> {
  const res = await fetch(`${CLOUD_RUN_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  });
  if (!res.ok) throw new Error("Refresh failed");
  const data = await res.json() as any;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refresh_token,
    expiry_date: Date.now() + data.expires_in * 1000,
  };
}

async function authenticateViaBrowser(): Promise<StoredTokens> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const sessionId = crypto.randomBytes(16).toString("hex");

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start local server"));
        return;
      }

      const port = address.port;
      const startUrl = `${CLOUD_RUN_URL}/auth/start?session_id=${sessionId}&port=${port}`;

      server.on("request", async (req, res) => {
        if (!req.url?.startsWith("/callback")) {
          res.writeHead(404);
          res.end();
          return;
        }

        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        const returnedSessionId = url.searchParams.get("session_id");
        const error = url.searchParams.get("error");

        if (error || returnedSessionId !== sessionId) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body><h2>Authorization failed.</h2><p>You can close this tab.</p></body></html>");
          server.close();
          reject(new Error(`Authorization failed: ${error || "session mismatch"}`));
          return;
        }

        try {
          // Pick up tokens from Cloud Run (one-time)
          const tokenRes = await fetch(`${CLOUD_RUN_URL}/auth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId }),
          });

          if (!tokenRes.ok) throw new Error("Failed to retrieve tokens");
          const data = await tokenRes.json() as any;

          const tokens: StoredTokens = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expiry_date: Date.now() + data.expires_in * 1000,
          };

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body><h2>Authorized!</h2><p>You can close this tab and return to Claude Code.</p></body></html>");
          server.close();
          resolve(tokens);
        } catch (err) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body><h2>Token retrieval failed.</h2><p>Check the terminal for details.</p></body></html>");
          server.close();
          reject(err);
        }
      });

      console.error(`Opening browser for Google sign-in...\nIf it doesn't open, visit:\n${startUrl}`);
      open(startUrl).catch(() => {});
    });

    server.on("error", reject);
  });
}

export async function getAccessToken(): Promise<string> {
  // 1. Try cached tokens
  if (cachedTokens && cachedTokens.expiry_date > Date.now() + 60_000) {
    return cachedTokens.access_token;
  }

  // 2. Try stored tokens
  const stored = loadTokens();
  if (stored) {
    if (stored.expiry_date > Date.now() + 60_000) {
      cachedTokens = stored;
      return stored.access_token;
    }

    // Try to refresh
    try {
      const refreshed = await refreshTokens(stored.refresh_token);
      saveTokens(refreshed);
      cachedTokens = refreshed;
      return refreshed.access_token;
    } catch {
      // Refresh failed — fall through to browser auth
    }
  }

  // 3. Full browser-based OAuth flow via Cloud Run
  const tokens = await authenticateViaBrowser();
  saveTokens(tokens);
  cachedTokens = tokens;
  return tokens.access_token;
}
