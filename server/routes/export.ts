import archiver from "archiver";
import { and, asc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { type Response, Router } from "express";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { languageExt } from "../../shared/constants.ts";
import { db, schema } from "../db/index.ts";
import { notFound, param, qs, qsDate, uid } from "../lib/http.ts";
import { attachTags } from "../lib/tags.ts";
import { buildBackupFiles } from "../lib/backupLayout.ts";
import { storage } from "../storage.ts";

const {
  users, workspaces, folders, notes, codeSnippets, diagrams, resources, dsaProblems, dsaSolutions, lldExercises, books, bookHighlights,
  readingLogs, attachments, activities, tags, contentTags, memos,
} = schema;

export const BACKUP_FORMAT = "devspace-backup";
export const BACKUP_VERSION = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
turndown.use(gfm);
// TipTap task items: <li data-type="taskItem" data-checked="true">…</li>
turndown.addRule("taskItem", {
  filter: (node) => node.nodeName === "LI" && node.getAttribute("data-type") === "taskItem",
  replacement: (content, node) => {
    const checked = (node as unknown as { getAttribute(n: string): string | null }).getAttribute("data-checked") === "true";
    return `- [${checked ? "x" : " "}] ${content.replace(/^\s+|\s+$/g, "").replace(/\n+/g, "\n  ")}\n`;
  },
});

export function sanitizeName(name: string, fallback = "untitled"): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
  return cleaned.replace(/^\.+/, "") || fallback;
}

export function uniquePath(used: Set<string>, base: string, ext: string): string {
  let candidate = `${base}${ext}`;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base} (${i})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function yamlFrontmatter(fields: Record<string, unknown>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${JSON.stringify(v instanceof Date ? v.toISOString() : v)}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

type NoteRow = typeof notes.$inferSelect;
function noteBodyMarkdown(note: NoteRow): string {
  if (note.format === "markdown") return note.contentMarkdown;
  return note.contentHtml ? turndown.turndown(note.contentHtml) : note.plainText;
}

export function noteToMarkdown(note: NoteRow & { tags: string[] }, ctx: { workspace?: string; folder?: string }): string {
  return (
    yamlFrontmatter({
      title: note.title,
      workspace: ctx.workspace,
      folder: ctx.folder || undefined,
      tags: note.tags,
      created: note.createdAt,
      updated: note.updatedAt,
      id: note.id,
    }) +
    `# ${note.title}\n\n` +
    noteBodyMarkdown(note) +
    "\n"
  );
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}

function sendFile(res: Response, filename: string, type: string, body: string) {
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(body);
}

function startZip(res: Response, filename: string) {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("warning", (err) => console.warn("[export] zip warning", err));
  archive.on("error", (err) => {
    console.error("[export] zip error", err);
    res.destroy(err);
  });
  archive.pipe(res);
  return archive;
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

/** Build "a/b/c" folder paths for every folder id. */
export function folderPaths(rows: (typeof folders.$inferSelect)[]): Map<string, string> {
  const byId = new Map(rows.map((f) => [f.id, f]));
  const cache = new Map<string, string>();
  const resolve = (id: string, depth = 0): string => {
    if (cache.has(id)) return cache.get(id)!;
    const f = byId.get(id);
    if (!f || depth > 64) return "";
    const parent = f.parentId ? resolve(f.parentId, depth + 1) : "";
    const p = parent ? `${parent}/${sanitizeName(f.name)}` : sanitizeName(f.name);
    cache.set(id, p);
    return p;
  };
  for (const f of rows) resolve(f.id);
  return cache;
}

export async function loadAll(userId: string) {
  const own = <T extends { userId: unknown }>(t: T) => eq((t as unknown as typeof notes).userId, userId);
  const [
    ws, fs, ns, sn, dg, rs, dp, ds, ll, bk, hl, rl, at, ac, tg, ct, mm, me,
  ] = await Promise.all([
    db.select().from(workspaces).where(own(workspaces)).orderBy(asc(workspaces.position)),
    db.select().from(folders).where(own(folders)).orderBy(asc(folders.position)),
    db.select().from(notes).where(own(notes)),
    db.select().from(codeSnippets).where(own(codeSnippets)),
    db.select().from(diagrams).where(own(diagrams)),
    db.select().from(resources).where(own(resources)),
    db.select().from(dsaProblems).where(own(dsaProblems)),
    db.select().from(dsaSolutions).where(own(dsaSolutions)).orderBy(asc(dsaSolutions.position)),
    db.select().from(lldExercises).where(own(lldExercises)),
    db.select().from(books).where(own(books)),
    db.select().from(bookHighlights).where(own(bookHighlights)),
    db.select().from(readingLogs).where(own(readingLogs)),
    db.select().from(attachments).where(own(attachments)),
    db.select().from(activities).where(own(activities)).orderBy(asc(activities.date)),
    db.select().from(tags).where(own(tags)),
    db.select().from(contentTags).where(own(contentTags)),
    db.select().from(memos).where(own(memos)).orderBy(asc(memos.createdAt)),
    db.select({ email: users.email, displayName: users.displayName, settings: users.settings, createdAt: users.createdAt })
      .from(users).where(eq(users.id, userId)),
  ]);
  return {
    profile: me[0],
    workspaces: ws, folders: fs, notes: ns, codeSnippets: sn, diagrams: dg, resources: rs, dsaProblems: dp, dsaSolutions: ds,
    lldExercises: ll, books: bk, bookHighlights: hl, readingLogs: rl, attachments: at, activities: ac, tags: tg, contentTags: ct,
    memos: mm,
  };
}

/** A workspace's dashboard notes as Markdown, newest first, or null when it has none. */
export function memosMarkdown(workspaceName: string, rows: (typeof memos.$inferSelect)[]): string | null {
  if (!rows.length) return null;
  const items = [...rows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((m) => `## ${m.createdAt.toISOString().slice(0, 10)}\n\n${m.body.trim()}\n`);
  return `# ${workspaceName}: progress notes\n\nShort notes from the DevSpace dashboard on how this topic is going.\n\n${items.join("\n")}`;
}

const attachmentArchivePath = (a: typeof attachments.$inferSelect) => `attachments/${a.id}-${sanitizeName(a.fileName, "file")}`;

export function backupDocument(data: Awaited<ReturnType<typeof loadAll>>) {
  const { profile, ...rest } = data;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    data: { ...rest, attachments: rest.attachments.map((a) => ({ ...a, archivePath: attachmentArchivePath(a) as string | null })) },
  };
}

export const ACTIVITY_COLUMNS = [
  "date", "startTime", "endTime", "title", "workspace", "completed", "plannedMinutes", "actualMinutes", "description", "notes", "completedAt", "id",
];
export const DSA_COLUMNS = [
  "title", "platform", "url", "topic", "difficulty", "status", "attemptedOn", "solvedOn", "timeComplexity", "spaceComplexity",
  "reviewCount", "lastReviewedOn", "nextReviewOn", "tags", "workspace", "id",
];
export const BOOK_COLUMNS = [
  "title", "author", "status", "totalPages", "currentPage", "progressPercent", "startedOn", "completedOn", "tags", "description", "id",
];

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const exportRouter = Router();

exportRouter.get("/backup.json", async (req, res) => {
  const doc = backupDocument(await loadAll(uid(req)));
  sendFile(res, `devspace-backup-${stamp()}.json`, "application/json", JSON.stringify(doc, null, 2));
});

/**
 * Everything, laid out like the app (see backupLayout.ts): notes, code, drawings, links,
 * questions, files and book PDFs per workspace and folder, plus devspace-backup.json.
 * Stamps the account's lastBackupAt once the whole archive has been written.
 */
exportRouter.get("/archive.zip", async (req, res) => {
  const userId = uid(req);
  const files = await buildBackupFiles(userId);
  const archive = startZip(res, `devspace-backup-${stamp()}.zip`);
  const root = `devspace-backup-${stamp()}`;
  for (const [name, f] of files) {
    if ("text" in f) {
      archive.append(f.text, { name: `${root}/${name}` });
      continue;
    }
    // Files one at a time, to keep memory and storage connections bounded.
    try {
      const obj = await storage.get(f.attachment.storageKey);
      if (!obj) continue;
      await new Promise<void>((resolve, reject) => {
        archive.once("entry", () => resolve());
        obj.stream.once("error", reject);
        archive.append(obj.stream, { name: `${root}/${name}` });
      });
    } catch (err) {
      console.error(`[export] skipped attachment ${f.attachment.id}`, err);
    }
  }
  await archive.finalize();
  await db
    .update(users)
    .set({ settings: sql`${users.settings} || ${JSON.stringify({ lastBackupAt: new Date().toISOString() })}::jsonb` })
    .where(eq(users.id, userId));
});

exportRouter.get("/notes.zip", async (req, res) => {
  const userId = uid(req);
  const ws = qs(req, "workspaceId");
  const where: SQL[] = [eq(notes.userId, userId)];
  if (ws) where.push(eq(notes.workspaceId, ws));
  const [rows, wsRows, folderRows] = await Promise.all([
    db.select().from(notes).where(and(...where)),
    db.select().from(workspaces).where(eq(workspaces.userId, userId)),
    db.select().from(folders).where(eq(folders.userId, userId)),
  ]);
  const tagged = await attachTags(userId, "noteId", rows);
  const paths = folderPaths(folderRows);
  const archive = startZip(res, `devspace-notes-${stamp()}.zip`);
  const used = new Set<string>();
  for (const n of tagged) {
    const w = wsRows.find((x) => x.id === n.workspaceId);
    const dir = [sanitizeName(w?.name ?? "workspace"), n.folderId ? paths.get(n.folderId) : ""].filter(Boolean).join("/");
    archive.append(noteToMarkdown(n, { workspace: w?.name, folder: n.folderId ? paths.get(n.folderId) : undefined }), {
      name: uniquePath(used, `${dir}/${sanitizeName(n.title)}`, ".md"),
    });
  }
  await archive.finalize();
});

exportRouter.get("/notes/:id", async (req, res) => {
  const userId = uid(req);
  const [n] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, param(req)), eq(notes.userId, userId)))
    .limit(1);
  if (!n) throw notFound("Note not found");
  const [w] = await db.select().from(workspaces).where(eq(workspaces.id, n.workspaceId));
  const [tagged] = await attachTags(userId, "noteId", [n]);
  sendFile(res, `${sanitizeName(n.title)}.md`, "text/markdown; charset=utf-8", noteToMarkdown(tagged!, { workspace: w?.name }));
});

exportRouter.get("/snippets.zip", async (req, res) => {
  const userId = uid(req);
  const ws = qs(req, "workspaceId");
  const rows = await db
    .select()
    .from(codeSnippets)
    .where(and(eq(codeSnippets.userId, userId), ws ? eq(codeSnippets.workspaceId, ws) : undefined));
  const wsRows = await db.select().from(workspaces).where(eq(workspaces.userId, userId));
  const archive = startZip(res, `devspace-snippets-${stamp()}.zip`);
  const used = new Set<string>();
  for (const s of rows) {
    const w = wsRows.find((x) => x.id === s.workspaceId);
    archive.append(s.code, {
      name: uniquePath(used, `${sanitizeName(w?.name ?? "workspace")}/${sanitizeName(s.title)}`, `.${languageExt(s.language)}`),
    });
  }
  await archive.finalize();
});

exportRouter.get("/snippets/:id", async (req, res) => {
  const [s] = await db
    .select()
    .from(codeSnippets)
    .where(and(eq(codeSnippets.id, param(req)), eq(codeSnippets.userId, uid(req))))
    .limit(1);
  if (!s) throw notFound("Snippet not found");
  sendFile(res, `${sanitizeName(s.title)}.${languageExt(s.language)}`, "text/plain; charset=utf-8", s.code);
});

exportRouter.get("/activities.csv", async (req, res) => {
  const userId = uid(req);
  const where: SQL[] = [eq(activities.userId, userId)];
  const from = qsDate(req, "from");
  const to = qsDate(req, "to");
  if (from) where.push(gte(activities.date, from));
  if (to) where.push(lte(activities.date, to));
  const ws = qs(req, "workspaceId");
  if (ws) where.push(eq(activities.workspaceId, ws));
  const rows = await db
    .select({ a: activities, workspace: workspaces.name })
    .from(activities)
    .leftJoin(workspaces, eq(workspaces.id, activities.workspaceId))
    .where(and(...where))
    .orderBy(asc(activities.date), asc(activities.startTime));
  sendFile(
    res,
    `devspace-activities-${stamp()}.csv`,
    "text/csv; charset=utf-8",
    toCsv(rows.map((r) => ({ ...r.a, workspace: r.workspace ?? "" })), ACTIVITY_COLUMNS),
  );
});

exportRouter.get("/dsa.:format", async (req, res) => {
  const userId = uid(req);
  const format = req.params.format;
  if (format !== "csv" && format !== "json") throw notFound();
  const rows = await db
    .select({ p: dsaProblems, workspace: workspaces.name })
    .from(dsaProblems)
    .innerJoin(workspaces, eq(workspaces.id, dsaProblems.workspaceId))
    .where(eq(dsaProblems.userId, userId))
    .orderBy(asc(dsaProblems.createdAt));
  const tagged = await attachTags(userId, "dsaProblemId", rows.map((r) => ({ ...r.p, workspace: r.workspace })));
  if (format === "csv") {
    sendFile(res, `devspace-dsa-${stamp()}.csv`, "text/csv; charset=utf-8", toCsv(tagged, DSA_COLUMNS));
    return;
  }
  const solutions = await db.select().from(dsaSolutions).where(eq(dsaSolutions.userId, userId)).orderBy(asc(dsaSolutions.position));
  const doc = tagged.map((p) => ({ ...p, solutions: solutions.filter((s) => s.problemId === p.id) }));
  sendFile(res, `devspace-dsa-${stamp()}.json`, "application/json", JSON.stringify(doc, null, 2));
});

exportRouter.get("/books.:format", async (req, res) => {
  const userId = uid(req);
  const format = req.params.format;
  if (format !== "csv" && format !== "json") throw notFound();
  const rows = await attachTags(userId, "bookId", await db.select().from(books).where(eq(books.userId, userId)).orderBy(asc(books.title)));
  const withPct = rows.map((b) => ({ ...b, progressPercent: b.totalPages ? Math.round((b.currentPage / b.totalPages) * 100) : 0 }));
  if (format === "csv") {
    sendFile(res, `devspace-books-${stamp()}.csv`, "text/csv; charset=utf-8", toCsv(withPct, BOOK_COLUMNS));
    return;
  }
  const [hl, logs] = await Promise.all([
    db.select().from(bookHighlights).where(eq(bookHighlights.userId, userId)),
    db.select().from(readingLogs).where(eq(readingLogs.userId, userId)),
  ]);
  const doc = withPct.map((b) => ({
    ...b,
    highlights: hl.filter((h) => h.bookId === b.id),
    readingLog: logs.filter((l) => l.bookId === b.id),
  }));
  sendFile(res, `devspace-books-${stamp()}.json`, "application/json", JSON.stringify(doc, null, 2));
});
