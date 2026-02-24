"use strict";

const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URLSearchParams } = require("url");

const PORT = process.env.PORT || 8080;
const PROJECT_ID = "datadog-community";
const CLIENT_ID = "1036979431900-qs3pg7m68h198i519gshdnucbd6ltrc7.apps.googleusercontent.com";
const CLOUD_RUN_URL = "https://google-workspace-mcp-1036979431900.us-central1.run.app";
const ALLOWED_DOMAIN = "datadog.com";

const SCOPES = [
  "openid",
  "email",
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
].join(" ");

// Secret Manager
const secretClient = new SecretManagerServiceClient();
let cachedClientSecret = null;

async function getClientSecret() {
  if (cachedClientSecret) return cachedClientSecret;
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/google-workspace-mcp-client-secret/versions/latest`,
  });
  cachedClientSecret = version.payload.data.toString("utf8");
  return cachedClientSecret;
}

// In-memory session store — safe because maxScale=1
const sessions = new Map();

// Clean up sessions older than 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.created < cutoff) sessions.delete(id);
  }
}, 60 * 1000);

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    // ── Serve MCP server bundle ──────────────────────────────────────────────
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/server.js")) {
      const file = fs.readFileSync(path.join(__dirname, "server.js"));
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        "Content-Length": file.length,
      });
      res.end(file);

    // ── Step 1: Local server opens browser here ──────────────────────────────
    } else if (req.method === "GET" && url.pathname === "/auth/start") {
      const sessionId = url.searchParams.get("session_id");
      const port = url.searchParams.get("port");

      if (!sessionId || !port || !/^[a-f0-9]{32}$/.test(sessionId) || !/^\d{1,5}$/.test(port)) {
        res.writeHead(400);
        res.end("Invalid parameters");
        return;
      }

      sessions.set(sessionId, { port, created: Date.now() });

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", `${CLOUD_RUN_URL}/auth/callback`);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", sessionId);
      authUrl.searchParams.set("hd", ALLOWED_DOMAIN); // hints Google to show only @datadog.com accounts

      res.writeHead(302, { Location: authUrl.toString() });
      res.end();

    // ── Step 2: Google redirects here after user consents ────────────────────
    } else if (req.method === "GET" && url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code");
      const sessionId = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error || !code || !sessionId) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Authorization failed.</h2><p>You can close this tab.</p></body></html>");
        return;
      }

      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Session expired.</h2><p>Please try again.</p></body></html>");
        return;
      }

      const clientSecret = await getClientSecret();

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: clientSecret,
          redirect_uri: `${CLOUD_RUN_URL}/auth/callback`,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<html><body><h2>Token exchange failed.</h2><p>${tokenData.error_description || tokenData.error}</p></body></html>`);
        return;
      }

      // Verify @datadog.com via hd claim in ID token
      const idPayload = JSON.parse(
        Buffer.from(tokenData.id_token.split(".")[1], "base64url").toString()
      );

      if (idPayload.hd !== ALLOWED_DOMAIN) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Access denied.</h2><p>This tool is for Datadog employees only.</p></body></html>");
        sessions.delete(sessionId);
        return;
      }

      // Store tokens — deleted after one-time pickup by local server
      session.tokens = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
      };
      sessions.set(sessionId, session);

      // Redirect browser back to local server
      res.writeHead(302, {
        Location: `http://127.0.0.1:${session.port}/callback?session_id=${sessionId}`,
      });
      res.end();

    // ── Step 3: Local server picks up tokens (one-time use) ──────────────────
    } else if (req.method === "POST" && url.pathname === "/auth/token") {
      const body = await parseBody(req);
      const session = sessions.get(body.session_id);

      if (!session?.tokens) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Session not found or already used" }));
        return;
      }

      const tokens = session.tokens;
      sessions.delete(body.session_id); // one-time use — delete immediately

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tokens));

    // ── Refresh: local server sends refresh_token, gets new access_token ─────
    } else if (req.method === "POST" && url.pathname === "/auth/refresh") {
      const body = await parseBody(req);

      if (!body.refresh_token) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Missing refresh_token" }));
        return;
      }

      const clientSecret = await getClientSecret();

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: body.refresh_token,
          client_id: CLIENT_ID,
          client_secret: clientSecret,
          grant_type: "refresh_token",
        }),
      });

      const tokenData = await tokenRes.json();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tokenData));

    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  } catch (err) {
    console.error("Error:", err);
    res.writeHead(500);
    res.end("Internal server error");
  }
});

server.listen(PORT, () => console.log(`Serving on :${PORT}`));
