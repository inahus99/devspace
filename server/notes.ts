/**
 * The Notes app's own deployment: notebooks, drawings and the book reader on a separate URL.
 *
 * It serves the same built UI as DevSpace, marked as the Notes app, and passes every /api
 * request through to the DevSpace server. So both apps share one database, one file store,
 * one account and one GitHub sync, while each has its own address and deploys on its own.
 *
 * Env: PORT, API_ORIGIN (the DevSpace server, e.g. http://devspace.railway.internal:8080),
 * DEVSPACE_URL (DevSpace's public address, for links back).
 */
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import express from "express";
import helmet from "helmet";

const PORT = Number(process.env.PORT ?? 3001);
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3000";
const DEVSPACE_URL = (process.env.DEVSPACE_URL ?? "").replace(/\/+$/, "");
const isProd = process.env.NODE_ENV === "production";

const api = new URL(API_ORIGIN);
const client = api.protocol === "https:" ? https : http;
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "..", "dist");
const indexFile = path.join(clientDir, "index.html");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, app: "notes" });
});

// API: streamed straight through (uploads included). Cookies come back for this host.
app.use("/api", (req, res) => {
  const headers = { ...req.headers };
  headers.host = api.host;
  // DevSpace's same-origin check compares the browser's Origin with this host.
  headers["x-forwarded-host"] = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "";
  headers["x-forwarded-proto"] = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
  const upstream = client.request(
    { protocol: api.protocol, hostname: api.hostname, port: api.port, method: req.method, path: req.originalUrl, headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    console.error("[notes] API request failed", err.message);
    if (!res.headersSent) res.status(502).json({ error: "DevSpace is unreachable right now" });
    else res.destroy(err);
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
});

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'wasm-unsafe-eval'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:", "https:"],
        "font-src": ["'self'", "data:"],
        "worker-src": ["'self'", "blob:"],
        "connect-src": ["'self'"],
        "frame-src": ["'self'"],
        "object-src": ["'self'"],
        "upgrade-insecure-requests": isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(compression());

if (!fs.existsSync(indexFile)) throw new Error(`Build the client first: ${indexFile} is missing`);
const escape = (s: string) => s.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);
const page = fs
  .readFileSync(indexFile, "utf8")
  .replace("<head>", `<head>\n    <meta name="devspace-app" content="notes" data-devspace-url="${escape(DEVSPACE_URL)}" />`)
  .replace("<title>DevSpace</title>", "<title>Notes</title>");

app.use("/assets", express.static(path.join(clientDir, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }));
app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  res.setHeader("Cache-Control", "no-cache");
  res.type("html").send(page);
});

const server = app.listen(PORT, () => {
  console.log(`[notes] listening on :${PORT}, API at ${api.origin}`);
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
