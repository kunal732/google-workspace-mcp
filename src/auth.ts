import { OAuth2Client } from "google-auth-library";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import open from "open";

const CLIENT_ID =
  "1036979431900-aonmfjttk6bg60jpnuadep9u50p59mqf.apps.googleusercontent.com";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/presentations.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/tasks.readonly",
  "https://www.googleapis.com/auth/forms.body.readonly",
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.messages.readonly",
];

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

let cachedClient: OAuth2Client | null = null;

function createOAuth2Client(redirectUri?: string): OAuth2Client {
  return new OAuth2Client(CLIENT_ID, undefined, redirectUri);
}

function loadTokens(): StoredTokens | null {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const data = fs.readFileSync(TOKEN_PATH, "utf-8");
      return JSON.parse(data) as StoredTokens;
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

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

async function authenticateViaBrowser(): Promise<OAuth2Client> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start local server"));
        return;
      }

      const port = address.port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const client = createOAuth2Client(redirectUri);
      const pkce = generatePKCE();

      const authUrl = client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent",
        code_challenge: pkce.challenge,
        code_challenge_method: "S256",
      });

      server.on("request", async (req, res) => {
        if (!req.url?.startsWith("/callback")) {
          res.writeHead(404);
          res.end();
          return;
        }

        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error || !code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Authorization failed.</h2><p>You can close this tab.</p></body></html>"
          );
          server.close();
          reject(new Error(`Authorization failed: ${error || "no code"}`));
          return;
        }

        try {
          const { tokens } = await client.getToken({ code, codeVerifier: pkce.verifier });
          client.setCredentials(tokens);

          saveTokens({
            access_token: tokens.access_token!,
            refresh_token: tokens.refresh_token!,
            expiry_date: tokens.expiry_date!,
          });

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Authorized!</h2><p>You can close this tab and return to Claude Code.</p></body></html>"
          );
          server.close();
          resolve(client);
        } catch (err) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Token exchange failed.</h2><p>Check the terminal for details.</p></body></html>"
          );
          server.close();
          reject(err);
        }
      });

      console.error(
        `Opening browser for Google sign-in...\nIf it doesn't open, visit:\n${authUrl}`
      );
      open(authUrl).catch(() => {
        // Browser open failed — URL is printed above
      });
    });

    server.on("error", reject);
  });
}

export async function getAccessToken(): Promise<string> {
  // 1. Try cached client with valid token
  if (cachedClient) {
    const creds = cachedClient.credentials;
    if (creds.access_token && creds.expiry_date && creds.expiry_date > Date.now() + 60_000) {
      return creds.access_token;
    }
  }

  // 2. Try loading saved tokens
  const stored = loadTokens();
  if (stored) {
    const client = createOAuth2Client();
    client.setCredentials({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
      expiry_date: stored.expiry_date,
    });

    // If not expired, use directly
    if (stored.expiry_date > Date.now() + 60_000) {
      cachedClient = client;
      return stored.access_token;
    }

    // Try to refresh
    try {
      const { credentials } = await client.refreshAccessToken();
      saveTokens({
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || stored.refresh_token,
        expiry_date: credentials.expiry_date!,
      });
      client.setCredentials(credentials);
      cachedClient = client;
      return credentials.access_token!;
    } catch {
      // Refresh failed — fall through to browser auth
    }
  }

  // 3. Full browser-based OAuth flow
  const client = await authenticateViaBrowser();
  cachedClient = client;
  return client.credentials.access_token!;
}
