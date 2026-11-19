import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import cookieParser from "cookie-parser";
import { sql } from "drizzle-orm";
import express, { Router } from "express";
import helmet from "helmet";
import { authRouter, loadSession, requireAuth, sameOriginGuard } from "./auth.ts";
import { db, pool } from "./db/index.ts";
import { env, isProd } from "./env.ts";
import { errorHandler, HttpError } from "./lib/http.ts";
import { activitiesRouter } from "./routes/activities.ts";
import { attachmentsRouter, filesRouter } from "./routes/attachments.ts";
import { booksRouter, diagramsRouter, dsaRouter, lldRouter, notesRouter, resourcesRouter, snippetsRouter } from "./routes/content.ts";
import { exportRouter } from "./routes/export.ts";
import { syncRouter } from "./routes/sync.ts";
import { startSyncSchedule } from "./lib/githubSync.ts";
import { insightsRouter, searchRouter, tagsRouter } from "./routes/insights.ts";
import { foldersRouter, workspacesRouter } from "./routes/workspaces.ts";
import { drainStorageDeletions, storage } from "./storage.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "..", "dist");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

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
app.use(cookieParser());
// Excalidraw scenes embed pasted images, so diagrams get a larger body limit than everything else.
app.use("/api/diagrams", express.json({ limit: "40mb" }));
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", async (_req, res) => {
  await db.execute(sql`select 1`);
  res.json({ ok: true, storage: storage.name });
});

app.use("/api", sameOriginGuard, loadSession);
app.use("/api/auth", authRouter);

const api = Router();
api.use(requireAuth);
api.use("/workspaces", workspacesRouter);
api.use("/folders", foldersRouter);
api.use("/notes", notesRouter);
api.use("/snippets", snippetsRouter);
api.use("/diagrams", diagramsRouter);
api.use("/resources", resourcesRouter);
api.use("/dsa", dsaRouter);
api.use("/lld", lldRouter);
api.use("/books", booksRouter);
api.use("/activities", activitiesRouter);
api.use("/attachments", attachmentsRouter);
api.use("/files", filesRouter);
api.use("/search", searchRouter);
api.use("/tags", tagsRouter);
api.use("/insights", insightsRouter);
api.use("/export", exportRouter);
api.use("/sync", syncRouter);
app.use("/api", api);
app.use("/api", () => {
  throw new HttpError(404, "Unknown API route");
});

// Serve the built SPA (production). In development Vite serves the client.
if (fs.existsSync(path.join(clientDir, "index.html"))) {
  app.use(
    "/assets",
    express.static(path.join(clientDir, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }),
  );
  app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDir, "index.html"));
  });
}

app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`[devspace] listening on :${env.PORT} (${env.NODE_ENV}, storage=${storage.name})`);
});

// Clean up storage objects for deleted attachments (also triggered after deletes).
const drainTimer = setInterval(() => {
  drainStorageDeletions().catch((err) => console.error("[storage] drain failed", err));
}, 10 * 60 * 1000);
drainStorageDeletions().catch(() => {});
const stopSync = startSyncSchedule();

function shutdown(signal: string) {
  console.log(`[devspace] ${signal} received, shutting down`);
  clearInterval(drainTimer);
  stopSync();
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
