import path from "node:path/posix";
import { languageExt } from "../../shared/constants.ts";
import {
  ACTIVITY_COLUMNS,
  backupDocument,
  BOOK_COLUMNS,
  DSA_COLUMNS,
  folderPaths,
  loadAll,
  memosMarkdown,
  noteToMarkdown,
  sanitizeName,
  toCsv,
  uniquePath,
} from "../routes/export.ts";
import { inlineSceneFiles } from "./diagramFiles.ts";
import { BANNER_LABEL } from "./images.ts";

/**
 * The layout of a full backup, laid out like the app: one directory per workspace and folder,
 * holding that folder's notes (.md), code, drawings (.excalidraw), links.md, questions.md and
 * its files (screenshots, saved PDFs). Book PDFs go in books/, next to each book's notes.
 * devspace-backup.json at the root holds every record, so nothing depends on the Markdown.
 */

const BOOK_FILE_LABEL = "book-file";

export type BackupFile = { text: string } | { attachment: { id: string; storageKey: string; size: number } };

// ---------------------------------------------------------------------------
// Build the backup contents
// ---------------------------------------------------------------------------

function relLink(fromFile: string, toFile: string) {
  const rel = path.relative(path.dirname(fromFile), toFile);
  return rel.split("/").map(encodeURIComponent).join("/");
}

function mdCell(s: string | null | undefined) {
  return (s ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

export async function buildBackupFiles(userId: string): Promise<Map<string, BackupFile>> {
  const data = await loadAll(userId);
  const files = new Map<string, BackupFile>();
  const used = new Set<string>();
  const put = (p: string, f: BackupFile) => {
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
    // Images on drawings go inside their .excalidraw file; book PDFs sit with their book below.
    if (a.label === BOOK_FILE_LABEL || a.diagramId) continue;
    const standalone = !a.noteId && !a.dsaProblemId && !a.lldExerciseId && !a.bookId && !a.resourceId && a.label !== BANNER_LABEL;
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

  // Dashboard notes: one file at the top of each workspace.
  for (const w of data.workspaces) {
    const md = memosMarkdown(w.name, data.memos.filter((m) => m.workspaceId === w.id));
    if (md) put(uniquePath(used, `${dirOf(w.id, null)}/progress-notes`, ".md"), { text: md });
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
    const file = uniquePath(used, `${dir}/links`, ".md");
    // Images in a link's note sit in _attachments/ and are shown under it.
    const images = (id: string) =>
      data.attachments
        .filter((a) => a.resourceId === id && attachmentPath.has(a.id))
        .map((a) => `\n  ![${a.fileName.replace(/[[\]]/g, "")}](${relLink(file, attachmentPath.get(a.id)!)})`)
        .join("");
    const lines = rows
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((r) => `- [${r.title.replace(/[[\]]/g, "")}](${r.url}) · ${r.type}${r.status !== "unread" ? ` · ${r.status.replace("_", " ")}` : ""}${r.description ? `\n  ${r.description.replace(/\n/g, " ")}` : ""}${images(r.id)}`);
    put(file, { text: `# Links\n\n${lines.join("\n")}\n` });
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

  // DSA solutions as source files, beside their folder's questions.md.
  for (const sol of data.dsaSolutions) {
    const p = data.dsaProblems.find((x) => x.id === sol.problemId);
    if (!p) continue;
    const base = `${dirOf(p.workspaceId, p.folderId)}/solutions/${sanitizeName(p.title)}/${sanitizeName(sol.title)}`;
    put(uniquePath(used, base, `.${languageExt(sol.language)}`), { text: sol.code });
  }

  // Books: highlights, notes and reading log, with the book's PDF beside them.
  for (const b of data.books) {
    const pdf = data.attachments.find((a) => a.bookId === b.id && a.label === BOOK_FILE_LABEL);
    const hl = data.bookHighlights.filter((h) => h.bookId === b.id).sort((a, c) => (a.page ?? 0) - (c.page ?? 0));
    const logs = data.readingLogs.filter((l) => l.bookId === b.id).sort((a, c) => a.loggedOn.localeCompare(c.loggedOn));
    const file = uniquePath(used, `books/${sanitizeName(b.title)}`, ".md");
    if (pdf) {
      // Same name as the book's notes, so "X (2).md" pairs with "X (2).pdf".
      const p = uniquePath(used, file.replace(/\.md$/, ""), ".pdf");
      attachmentPath.set(pdf.id, p);
      put(p, { attachment: { id: pdf.id, storageKey: pdf.storageKey, size: pdf.sizeBytes } });
    }
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

  // Every record, machine-readable. Each attachment's archivePath points at its file in this
  // layout; images on drawings have none, because they live inside their .excalidraw file.
  const doc = backupDocument(data);
  doc.data.attachments = doc.data.attachments.map((a) => ({ ...a, archivePath: attachmentPath.get(a.id) ?? null }));
  put("devspace-backup.json", { text: JSON.stringify(doc, null, 2) });

  const tree = [...data.workspaces].map((w) => `- [${w.name}](${encodeURIComponent(wsDir.get(w.id)!)}/)`).join("\n");
  put("README.md", {
    text:
      `# DevSpace backup\n\nA full copy of your DevSpace data, downloaded ${doc.exportedAt.slice(0, 10)}. It's laid out like the app, so you can browse it in any file manager or editor.\n\n` +
      `## Workspaces\n\n${tree || "_None yet._"}\n\n` +
      `Each workspace and folder holds its notes (\`.md\`), code, drawings (\`.excalidraw\`, open at excalidraw.com), \`links.md\`, \`questions.md\`, ` +
      `DSA \`solutions/\` and a \`files/\` folder of screenshots and saved PDFs.\n\n` +
      `- \`<workspace>/progress-notes.md\`: the short notes on that workspace's dashboard card\n` +
      `- \`books/\`: each book's PDF, highlights, notes and reading log\n` +
      `- \`_attachments/\`: images embedded inside notes, and workspace banners\n` +
      `- \`activities.csv\`, \`dsa-problems.csv\`, \`books/books.csv\`: spreadsheet-friendly tables\n` +
      `- \`devspace-backup.json\`: every record (format \`${doc.format}\`, version ${doc.version})\n\n` +
      `## devspace-backup.json\n\n` +
      `\`data\` holds one array per table, with rows exactly as stored in PostgreSQL (camelCase columns, UUID ids). ` +
      `Relationships use the same ids (\`notes[].workspaceId\` → \`workspaces[].id\`, \`folders[].parentId\` → \`folders[].id\`). ` +
      `Dates are \`YYYY-MM-DD\`; timestamps are ISO-8601 UTC. \`attachments[].archivePath\` is where each file sits in this backup.\n`,
  });
  return files;
}
