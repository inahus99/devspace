import archiver from "archiver";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { type Response, Router } from "express";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { languageExt } from "../../shared/constants.ts";
import { db, schema } from "../db/index.ts";
import { notFound, param, qs, qsDate, uid } from "../lib/http.ts";
import { attachTags } from "../lib/tags.ts";
import { storage } from "../storage.ts";

const {
  users, workspaces, folders, notes, codeSnippets, diagrams, resources, dsaProblems, dsaSolutions, lldExercises, books, bookHighlights,
  readingLogs, attachments, activities, tags, contentTags,
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
    ws, fs, ns, sn, dg, rs, dp, ds, ll, bk, hl, rl, at, ac, tg, ct, me,
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
    db.select({ email: users.email, displayName: users.displayName, settings: users.settings, createdAt: users.createdAt })
      .from(users).where(eq(users.id, userId)),
  ]);
  return {
    profile: me[0],
    workspaces: ws, folders: fs, notes: ns, codeSnippets: sn, diagrams: dg, resources: rs, dsaProblems: dp, dsaSolutions: ds,
    lldExercises: ll, books: bk, bookHighlights: hl, readingLogs: rl, attachments: at, activities: ac, tags: tg, contentTags: ct,
  };
}

const attachmentArchivePath = (a: typeof attachments.$inferSelect) => `attachments/${a.id}-${sanitizeName(a.fileName, "file")}`;

export function backupDocument(data: Awaited<ReturnType<typeof loadAll>>) {
  const { profile, ...rest } = data;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    data: { ...rest, attachments: rest.attachments.map((a) => ({ ...a, archivePath: attachmentArchivePath(a) })) },
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

/** Everything: JSON backup + attachment files + Markdown notes + source snippets + CSVs. */
exportRouter.get("/archive.zip", async (req, res) => {
  const userId = uid(req);
  const data = await loadAll(userId);
  const archive = startZip(res, `devspace-archive-${stamp()}.zip`);
  const wsName = new Map(data.workspaces.map((w) => [w.id, sanitizeName(w.name, "workspace")]));
  const paths = folderPaths(data.folders);
  const tagNames = new Map(data.tags.map((t) => [t.id, t.name]));
  const tagsFor = (key: "noteId" | "snippetId" | "dsaProblemId" | "bookId", id: string) =>
    data.contentTags.filter((c) => c[key] === id).map((c) => tagNames.get(c.tagId) ?? "").filter(Boolean);
  const attachmentPath = new Map(data.attachments.map((a) => [a.id, attachmentArchivePath(a)]));

  archive.append(JSON.stringify(backupDocument(data), null, 2), { name: "devspace-backup.json" });
  archive.append(README, { name: "README.md" });

  const used = new Set<string>();
  for (const n of data.notes) {
    const dir = ["notes", wsName.get(n.workspaceId) ?? "workspace", n.folderId ? paths.get(n.folderId) : ""].filter(Boolean).join("/");
    const file = uniquePath(used, `${dir}/${sanitizeName(n.title)}`, ".md");
    const rel = "../".repeat(file.split("/").length - 1);
    const md = noteToMarkdown({ ...n, tags: tagsFor("noteId", n.id) }, {
      workspace: data.workspaces.find((w) => w.id === n.workspaceId)?.name,
      folder: n.folderId ? paths.get(n.folderId) : undefined,
    }).replace(/\/api\/files\/([0-9a-f-]{36})/g, (m, id: string) => (attachmentPath.has(id) ? `${rel}${attachmentPath.get(id)}` : m));
    archive.append(md, { name: file });
  }
  for (const s of data.codeSnippets) {
    const dir = ["snippets", wsName.get(s.workspaceId) ?? "workspace", s.folderId ? paths.get(s.folderId) : ""].filter(Boolean).join("/");
    archive.append(s.code, { name: uniquePath(used, `${dir}/${sanitizeName(s.title)}`, `.${languageExt(s.language)}`) });
  }
  // Diagrams as standard .excalidraw files, which excalidraw.com can open directly.
  for (const d of data.diagrams) {
    const dir = ["diagrams", wsName.get(d.workspaceId) ?? "workspace", d.folderId ? paths.get(d.folderId) : ""].filter(Boolean).join("/");
    const file = { type: "excalidraw", version: 2, source: "devspace", elements: d.scene.elements ?? [], appState: d.scene.appState ?? {}, files: d.scene.files ?? {} };
    archive.append(JSON.stringify(file), { name: uniquePath(used, `${dir}/${sanitizeName(d.title)}`, ".excalidraw") });
  }
  for (const sol of data.dsaSolutions) {
    const p = data.dsaProblems.find((x) => x.id === sol.problemId);
    if (!p) continue;
    archive.append(sol.code, {
      name: uniquePath(used, `dsa/solutions/${sanitizeName(p.title)}/${sanitizeName(sol.title)}`, `.${languageExt(sol.language)}`),
    });
  }
  archive.append(
    toCsv(
      data.activities.map((a) => ({ ...a, workspace: a.workspaceId ? (wsName.get(a.workspaceId) ?? "") : "" })),
      ACTIVITY_COLUMNS,
    ),
    { name: "activities.csv" },
  );
  archive.append(
    toCsv(data.dsaProblems.map((p) => ({ ...p, tags: tagsFor("dsaProblemId", p.id), workspace: wsName.get(p.workspaceId) })), DSA_COLUMNS),
    { name: "dsa/problems.csv" },
  );
  archive.append(
    toCsv(
      data.books.map((b) => ({ ...b, tags: tagsFor("bookId", b.id), progressPercent: b.totalPages ? Math.round((b.currentPage / b.totalPages) * 100) : 0 })),
      BOOK_COLUMNS,
    ),
    { name: "books/books.csv" },
  );

  // Attachment binaries, one at a time to keep memory and connections bounded.
  for (const a of data.attachments) {
    try {
      const obj = await storage.get(a.storageKey);
      if (!obj) continue;
      await new Promise<void>((resolve, reject) => {
        archive.once("entry", () => resolve());
        obj.stream.once("error", reject);
        archive.append(obj.stream, { name: attachmentArchivePath(a) });
      });
    } catch (err) {
      console.error(`[export] skipped attachment ${a.id}`, err);
    }
  }
  await archive.finalize();
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

const README = `# DevSpace archive

This archive is a complete, portable copy of your DevSpace data.

| Path | Contents |
| --- | --- |
| \`devspace-backup.json\` | Every record (format \`${BACKUP_FORMAT}\`, version ${BACKUP_VERSION}). See below. |
| \`notes/<workspace>/<folders>/<title>.md\` | Notes as Markdown with YAML front-matter. Images point into \`attachments/\`. |
| \`snippets/<workspace>/<folders>/<title>.<ext>\` | Code snippets in their original language. |
| \`dsa/solutions/<problem>/<solution>.<ext>\` | DSA solutions as source files. |
| \`dsa/problems.csv\`, \`books/books.csv\`, \`activities.csv\` | Spreadsheet-friendly tables. |
| \`attachments/<id>-<filename>\` | Uploaded files, screenshots and PDFs. |

## devspace-backup.json

\`\`\`
{
  "format": "${BACKUP_FORMAT}",
  "version": ${BACKUP_VERSION},
  "exportedAt": ISO timestamp,
  "profile": { email, displayName, settings, createdAt },
  "data": {
    "workspaces", "folders", "notes", "codeSnippets", "resources", "dsaProblems", "dsaSolutions",
    "lldExercises", "books", "bookHighlights", "readingLogs", "attachments", "activities",
    "tags", "contentTags"
  }
}
\`\`\`

Each array holds rows exactly as stored in PostgreSQL (camelCase column names, UUID ids).
Relationships use the same ids (e.g. \`notes[].workspaceId\` → \`workspaces[].id\`,
\`folders[].parentId\` → \`folders[].id\`). Dates are \`YYYY-MM-DD\` (local calendar dates);
timestamps are ISO-8601 UTC. Rich notes keep both the TipTap JSON (\`contentJson\`) and HTML
(\`contentHtml\`); Markdown notes use \`contentMarkdown\`. \`attachments[].archivePath\` locates
each file inside this archive.
`;
