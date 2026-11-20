import { createHash } from "node:crypto";
import path from "node:path/posix";
import { eq } from "drizzle-orm";
import { languageExt } from "../../shared/constants.ts";
import { db, schema } from "../db/index.ts";
import { env } from "../env.ts";
import {
  ACTIVITY_COLUMNS,
  backupDocument,
  BOOK_COLUMNS,
  DSA_COLUMNS,
  folderPaths,
  loadAll,
  noteToMarkdown,
  sanitizeName,
  toCsv,
  uniquePath,
} from "../routes/export.ts";
import { storage } from "../storage.ts";
import { inlineSceneFiles } from "./diagramFiles.ts";
import { BANNER_LABEL } from "./images.ts";

/**
 * One-way mirror of a DevSpace account into a private GitHub repository, laid out like the
 * app: one directory per workspace and folder, holding that folder's notes (.md), code,
 * drawings (.excalidraw), links.md, questions.md and its files (screenshots, saved PDFs).
 *
 * Uses the Git Data API, so no git binary is needed: every run builds the full file set,
 * uploads only blobs GitHub doesn't already have, and commits a fresh tree (deletions
 * included) when anything changed. Book PDFs and very large files stay out of git.
 */

const BOOK_FILE_LABEL = "book-file";
const MAX_FILE_BYTES = 50 * 1024 * 1024; // GitHub warns at 50 MB and rejects 100 MB

export const syncConfigured = () => !!(env.GITHUB_SYNC_TOKEN && env.GITHUB_SYNC_REPO);

type RepoFile = { text: string } | { attachment: { id: string; storageKey: string; size: number } };

// ---------------------------------------------------------------------------
// Build the repository contents
// ---------------------------------------------------------------------------

function relLink(fromFile: string, toFile: string) {
  const rel = path.relative(path.dirname(fromFile), toFile);
  return rel.split("/").map(encodeURIComponent).join("/");
}

function mdCell(s: string | null | undefined) {
  return (s ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

async function buildFiles(userId: string): Promise<Map<string, RepoFile>> {
  const data = await loadAll(userId);
  const files = new Map<string, RepoFile>();
  const used = new Set<string>();
  const put = (p: string, f: RepoFile) => {
    used.add(p.toLowerCase());
    files.set(p, f);
  };

  const wsDir = new Map<string, string>();
  const wsUsed = new Set<string>(["books", "_attachments", "readme.md"]);
  for (const w of data.workspaces) wsDir.set(w.id, uniquePath(wsUsed, sanitizeName(w.name, "workspace"), ""));
  const fPaths = folderPaths(data.folders);
  const dirOf = (workspaceId: string | null, folderId: string | null) =>
    [workspaceId ? (wsDir.get(workspaceId) ?? "No workspace") : "No workspace", folderId ? fPaths.get(folderId) : ""].filter(Boolean).join("/");

  const tagNames = new Map(data.tags.map((t) => [t.id, t.name]));
  const tagsFor = (key: "noteId" | "snippetId" | "dsaProblemId" | "bookId", id: string) =>
    data.contentTags.filter((c) => c[key] === id).map((c) => tagNames.get(c.tagId) ?? "").filter(Boolean);

  // Files first, so notes can link to them. Standalone files sit in their folder's files/;
  // images embedded in notes, problems etc. go to _attachments/.
  const attachmentPath = new Map<string, string>();
  for (const a of data.attachments) {
    // Images on drawings go inside their .excalidraw file instead.
    if (a.label === BOOK_FILE_LABEL || a.label === BANNER_LABEL || a.diagramId || a.sizeBytes > MAX_FILE_BYTES) continue;
    const standalone = !a.noteId && !a.dsaProblemId && !a.lldExerciseId && !a.bookId;
    const dir = standalone ? `${dirOf(a.workspaceId, a.folderId)}/files` : "_attachments";
    const ext = path.extname(a.fileName).toLowerCase().replace(/[^.a-z0-9]/g, "");
    const base = sanitizeName(path.basename(a.fileName, path.extname(a.fileName)), "file");
    const p = uniquePath(used, `${dir}/${standalone ? base : `${a.id.slice(0, 8)}-${base}`}`, ext);
    attachmentPath.set(a.id, p);
    files.set(p, { attachment: { id: a.id, storageKey: a.storageKey, size: a.sizeBytes } });
  }
  const linkFiles = (md: string, file: string) =>
    md.replace(/\/api\/files\/([0-9a-f-]{36})/g, (m, id: string) => (attachmentPath.has(id) ? relLink(file, attachmentPath.get(id)!) : m));

  for (const n of data.notes) {
    const file = uniquePath(used, `${dirOf(n.workspaceId, n.folderId)}/${sanitizeName(n.title)}`, ".md");
    const md = noteToMarkdown({ ...n, tags: tagsFor("noteId", n.id) }, {
      workspace: data.workspaces.find((w) => w.id === n.workspaceId)?.name,
      folder: n.folderId ? fPaths.get(n.folderId) : undefined,
    });
    put(file, { text: linkFiles(md, file) });
  }
  for (const s of data.codeSnippets) {
    put(uniquePath(used, `${dirOf(s.workspaceId, s.folderId)}/${sanitizeName(s.title)}`, `.${languageExt(s.language)}`), { text: s.code });
  }
  const byId = new Map(data.attachments.map((a) => [a.id, a]));
  for (const d of data.diagrams) {
    const files = await inlineSceneFiles(d.scene.files, byId);
    const doc = { type: "excalidraw", version: 2, source: "devspace", elements: d.scene.elements ?? [], appState: d.scene.appState ?? {}, files };
    put(uniquePath(used, `${dirOf(d.workspaceId, d.folderId)}/${sanitizeName(d.title)}`, ".excalidraw"), { text: JSON.stringify(doc) });
  }

  // Links and questions: one Markdown list per folder.
  const group = <T extends { workspaceId: string | null; folderId: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = dirOf(r.workspaceId, r.folderId);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };
  for (const [dir, rows] of group(data.resources)) {
    const lines = rows
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((r) => `- [${r.title.replace(/[[\]]/g, "")}](${r.url}) · ${r.type}${r.status !== "unread" ? ` · ${r.status.replace("_", " ")}` : ""}${r.description ? `\n  ${r.description.replace(/\n/g, " ")}` : ""}`);
    put(uniquePath(used, `${dir}/links`, ".md"), { text: `# Links\n\n${lines.join("\n")}\n` });
  }
  for (const [dir, rows] of group(data.dsaProblems)) {
    const table = rows
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((p) => `| ${p.url ? `[${mdCell(p.title)}](${p.url})` : mdCell(p.title)} | ${p.difficulty} | ${p.status} | ${mdCell(p.platform)} |`);
    const details = rows
      .filter((p) => p.approach || p.pseudocode || p.notes)
      .map(
        (p) =>
          `## ${p.title}\n\n${p.approach ? `**Approach.** ${p.approach}\n\n` : ""}${p.pseudocode ? `\`\`\`\n${p.pseudocode}\n\`\`\`\n\n` : ""}${p.notes ? `${p.notes}\n\n` : ""}` +
          (p.timeComplexity || p.spaceComplexity ? `Time ${p.timeComplexity || "?"} · Space ${p.spaceComplexity || "?"}\n` : ""),
      );
    put(uniquePath(used, `${dir}/questions`, ".md"), {
      text: `# Questions\n\n| Problem | Difficulty | Status | Platform |\n| --- | --- | --- | --- |\n${table.join("\n")}\n\n${details.join("\n")}`,
    });
  }
  for (const x of data.lldExercises) {
    const section = (h: string, v: string | null | undefined) => (v && v.trim() ? `## ${h}\n\n${v.trim()}\n\n` : "");
    const md =
      `# ${x.title}\n\nStatus: ${x.status} · Difficulty: ${x.difficulty}\n\n` +
      section("Problem", x.problemStatement) +
      section("Functional requirements", x.functionalRequirements) +
      section("Non-functional requirements", x.nonFunctionalRequirements) +
      section("Entities", x.entities) +
      section("Design", x.diagramSource ? `\`\`\`\n${x.diagramSource}\n\`\`\`` : "") +
      section("Trade-offs", x.tradeOffs) +
      section("Interview notes", x.interviewNotes) +
      (x.implementationCode ? `## Implementation\n\n\`\`\`${x.implementationLanguage}\n${x.implementationCode}\n\`\`\`\n` : "");
    put(uniquePath(used, `${dirOf(x.workspaceId, x.folderId)}/${sanitizeName(x.title)}`, ".md"), { text: md });
  }

  // Books: highlights, notes and reading log (the PDFs themselves stay in DevSpace).
  for (const b of data.books) {
    const hl = data.bookHighlights.filter((h) => h.bookId === b.id).sort((a, c) => (a.page ?? 0) - (c.page ?? 0));
    const logs = data.readingLogs.filter((l) => l.bookId === b.id).sort((a, c) => a.loggedOn.localeCompare(c.loggedOn));
    const file = uniquePath(used, `books/${sanitizeName(b.title)}`, ".md");
    const md =
      `# ${b.title}\n\n${b.author ? `*${b.author}*\n\n` : ""}Status: ${b.status} · page ${b.currentPage}${b.totalPages ? ` of ${b.totalPages}` : ""}\n\n` +
      (b.description ? `${b.description}\n\n` : "") +
      (hl.length ? `## Highlights\n\n${hl.map((h) => `> ${h.content.replace(/\n/g, "\n> ")}\n${h.page ? `> — p. ${h.page}\n` : ""}${h.note ? `\n${h.note}\n` : ""}`).join("\n")}\n` : "") +
      (b.notes ? `## Notes\n\n${b.notes}\n\n` : "") +
      (logs.length ? `## Reading log\n\n${logs.map((l) => `- ${l.loggedOn}: p. ${l.fromPage} → ${l.toPage}`).join("\n")}\n` : "");
    put(file, { text: linkFiles(md, file) });
  }

  put("books/books.csv", {
    text: toCsv(
      data.books.map((b) => ({ ...b, tags: tagsFor("bookId", b.id), progressPercent: b.totalPages ? Math.round((b.currentPage / b.totalPages) * 100) : 0 })),
      BOOK_COLUMNS,
    ),
  });
  put("activities.csv", {
    text: toCsv(data.activities.map((a) => ({ ...a, workspace: a.workspaceId ? (wsDir.get(a.workspaceId) ?? "") : "" })), ACTIVITY_COLUMNS),
  });
  if (data.dsaProblems.length)
    put("dsa-problems.csv", { text: toCsv(data.dsaProblems.map((p) => ({ ...p, tags: tagsFor("dsaProblemId", p.id), workspace: wsDir.get(p.workspaceId) })), DSA_COLUMNS) });

  // Full machine-readable backup (without the export timestamp, so unchanged data means no commit).
  const { exportedAt: _ignored, ...backup } = backupDocument(data);
  put("devspace-backup.json", { text: JSON.stringify(backup, null, 2) });

  const tree = [...data.workspaces].map((w) => `- [${w.name}](${encodeURIComponent(wsDir.get(w.id)!)}/)`).join("\n");
  put("README.md", {
    text:
      `# DevSpace notes\n\nA read-only mirror of DevSpace, updated automatically. Edit in DevSpace; changes made here are overwritten.\n\n` +
      `## Workspaces\n\n${tree || "_None yet._"}\n\n` +
      `Each folder holds its notes (\`.md\`), code, drawings (\`.excalidraw\`, open at excalidraw.com), \`links.md\`, \`questions.md\` and a \`files/\` folder of screenshots and saved PDFs.\n\n` +
      `- \`books/\`: highlights, notes and reading log per book (book PDFs stay in DevSpace)\n` +
      `- \`_attachments/\`: images embedded inside notes\n` +
      `- \`activities.csv\`, \`devspace-backup.json\`: your plan history and a full data backup\n`,
  });
  return files;
}

// ---------------------------------------------------------------------------
// GitHub Git Data API
// ---------------------------------------------------------------------------

class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function gh<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_SYNC_REPO}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_SYNC_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "devspace-sync",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let msg = detail;
    try {
      msg = (JSON.parse(detail) as { message?: string }).message ?? detail;
    } catch {
      /* keep raw text */
    }
    throw new GitHubError(res.status, `GitHub ${method} ${endpoint.split("?")[0]} failed (${res.status}): ${msg.slice(0, 200)}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const gitBlobSha = (buf: Buffer) => createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");

/** Attachments never change after upload, so their blob hashes are cached by id. */
const attachmentSha = new Map<string, string>();

async function readAttachment(storageKey: string): Promise<Buffer | null> {
  const obj = await storage.get(storageKey);
  if (!obj) return null;
  const chunks: Buffer[] = [];
  for await (const c of obj.stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

export type SyncResult = { changed: boolean; added: number; modified: number; removed: number; commitUrl?: string; message: string };

async function runSync(userId: string, reason: string): Promise<SyncResult> {
  const branch = env.GITHUB_SYNC_BRANCH;
  // Current head (an empty repo gets a first commit through the contents API).
  let head: { object: { sha: string } };
  try {
    head = await gh("GET", `/git/ref/heads/${encodeURIComponent(branch)}`);
  } catch (err) {
    if (!(err instanceof GitHubError) || (err.status !== 404 && err.status !== 409)) throw err;
    await gh("PUT", "/contents/README.md", { message: "Initialise DevSpace mirror", content: Buffer.from("# DevSpace notes\n").toString("base64"), branch });
    head = await gh("GET", `/git/ref/heads/${encodeURIComponent(branch)}`);
  }
  const commit = await gh<{ tree: { sha: string } }>("GET", `/git/commits/${head.object.sha}`);
  const remote = await gh<{ tree: { path: string; type: string; sha: string; mode: string }[]; truncated: boolean }>(
    "GET",
    `/git/trees/${commit.tree.sha}?recursive=1`,
  );
  const remoteSha = new Map(remote.tree.filter((e) => e.type === "blob").map((e) => [e.path, e.sha]));

  const files = await buildFiles(userId);
  const entries: { path: string; sha: string }[] = [];
  const toUpload: { path: string; load: () => Promise<Buffer | null>; sha?: string }[] = [];
  let added = 0;
  let modified = 0;

  for (const [p, f] of files) {
    let sha: string | undefined;
    let load: () => Promise<Buffer | null>;
    if ("text" in f) {
      const buf = Buffer.from(f.text, "utf8");
      sha = gitBlobSha(buf);
      load = async () => buf;
    } else {
      const { id, storageKey } = f.attachment;
      sha = attachmentSha.get(id);
      load = async () => {
        const buf = await readAttachment(storageKey);
        if (buf) attachmentSha.set(id, gitBlobSha(buf));
        return buf;
      };
      if (!sha) {
        const buf = await load();
        if (!buf) continue; // file missing from storage
        sha = attachmentSha.get(id)!;
        load = async () => buf;
      }
    }
    const prev = remoteSha.get(p);
    if (prev === sha) {
      entries.push({ path: p, sha });
      continue;
    }
    if (prev) modified++;
    else added++;
    toUpload.push({ path: p, load, sha });
  }
  const removed = [...remoteSha.keys()].filter((p) => !files.has(p)).length;

  if (!toUpload.length && !removed) return { changed: false, added: 0, modified: 0, removed: 0, message: "Already up to date" };

  await pool(toUpload, 4, async (u) => {
    const buf = await u.load();
    if (!buf) return;
    const blob = await gh<{ sha: string }>("POST", "/git/blobs", { content: buf.toString("base64"), encoding: "base64" });
    entries.push({ path: u.path, sha: blob.sha });
  });

  const tree = await gh<{ sha: string }>("POST", "/git/trees", {
    tree: entries.map((e) => ({ path: e.path, mode: "100644", type: "blob", sha: e.sha })),
  });
  const parts = [added && `${added} added`, modified && `${modified} updated`, removed && `${removed} removed`].filter(Boolean).join(", ");
  const changedPaths = toUpload.map((u) => `- ${u.path}`).slice(0, 30);
  const created = await gh<{ sha: string; html_url: string }>("POST", "/git/commits", {
    message: `DevSpace sync: ${parts}\n\n${reason}\n\n${changedPaths.join("\n")}${toUpload.length > 30 ? `\n…and ${toUpload.length - 30} more` : ""}`,
    tree: tree.sha,
    parents: [head.object.sha],
  });
  await gh("PATCH", `/git/refs/heads/${encodeURIComponent(branch)}`, { sha: created.sha });
  return { changed: true, added, modified, removed, commitUrl: created.html_url, message: `Synced: ${parts}` };
}

// ---------------------------------------------------------------------------
// Status, locking and scheduling
// ---------------------------------------------------------------------------

export type SyncStatus = {
  configured: boolean;
  repo?: string;
  repoUrl?: string;
  branch?: string;
  intervalMinutes?: number;
  running: boolean;
  last?: { at: string; ok: boolean; message: string; commitUrl?: string };
};

let running: Promise<SyncResult> | null = null;
let last: SyncStatus["last"];

/** The DevSpace account mirrored to GitHub, or null if none can be chosen. */
export async function syncUserId(): Promise<string | null> {
  if (env.GITHUB_SYNC_USER_EMAIL) {
    const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, env.GITHUB_SYNC_USER_EMAIL.toLowerCase())).limit(1);
    return u?.id ?? null;
  }
  const rows = await db.select({ id: schema.users.id }).from(schema.users).limit(2);
  return rows.length === 1 ? rows[0]!.id : null;
}

export function syncStatus(): SyncStatus {
  if (!syncConfigured()) return { configured: false, running: false };
  return {
    configured: true,
    repo: env.GITHUB_SYNC_REPO,
    repoUrl: `https://github.com/${env.GITHUB_SYNC_REPO}`,
    branch: env.GITHUB_SYNC_BRANCH,
    intervalMinutes: env.GITHUB_SYNC_INTERVAL_MIN,
    running: !!running,
    last,
  };
}

export async function syncNow(userId: string, reason: string): Promise<SyncResult> {
  if (running) return running;
  running = runSync(userId, reason)
    .then((r) => {
      last = { at: new Date().toISOString(), ok: true, message: r.message, commitUrl: r.commitUrl ?? last?.commitUrl };
      if (r.changed) console.log(`[github-sync] ${r.message} ${r.commitUrl ?? ""}`);
      return r;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      last = { at: new Date().toISOString(), ok: false, message };
      console.error("[github-sync] failed:", message);
      throw err;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

/** Starts the periodic sync; returns a stop function. */
export function startSyncSchedule(): () => void {
  if (!syncConfigured() || env.GITHUB_SYNC_INTERVAL_MIN <= 0) return () => {};
  const tick = async () => {
    const userId = await syncUserId();
    if (!userId) {
      console.warn("[github-sync] no account to sync: set GITHUB_SYNC_USER_EMAIL");
      return;
    }
    await syncNow(userId, "Scheduled sync").catch(() => {});
  };
  const first = setTimeout(() => void tick(), 2 * 60 * 1000);
  const timer = setInterval(() => void tick(), env.GITHUB_SYNC_INTERVAL_MIN * 60 * 1000);
  console.log(`[github-sync] mirroring to ${env.GITHUB_SYNC_REPO} every ${env.GITHUB_SYNC_INTERVAL_MIN} min`);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
