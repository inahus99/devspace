import { randomUUID } from "node:crypto";
import path from "node:path";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { BANNER_LABEL } from "../lib/images.ts";
import { Router } from "express";
import multer from "multer";
import { attachmentTargetSchema, attachmentUpdateSchema } from "../../shared/schemas.ts";
import { db, schema } from "../db/index.ts";
import { env } from "../env.ts";
import { badRequest, notFound, param, parse, qs, uid } from "../lib/http.ts";
import { verifyRefs } from "../lib/refs.ts";
import { scheduleDrain, storage } from "../storage.ts";

const { attachments } = schema;
type AttachmentRow = typeof attachments.$inferSelect;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

/** Types safe to render inline in the browser. Everything else downloads. */
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "application/pdf"]);

export function fileUrl(id: string) {
  return `/api/files/${id}`;
}
export function presentAttachment(a: AttachmentRow) {
  return { ...a, url: fileUrl(a.id) };
}

function kindFor(mime: string): "image" | "pdf" | "file" {
  if (mime.startsWith("image/") && mime !== "image/svg+xml") return "image";
  if (mime === "application/pdf") return "pdf";
  return "file";
}

function safeExt(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : "";
}

export const attachmentsRouter = Router();

attachmentsRouter.get("/", async (req, res) => {
  const userId = uid(req);
  const where = [eq(attachments.userId, userId)];
  for (const key of ["noteId", "dsaProblemId", "lldExerciseId", "bookId", "diagramId", "workspaceId", "label"] as const) {
    const v = qs(req, key);
    if (v) where.push(eq(attachments[key], v));
  }
  const folder = qs(req, "folderId");
  if (folder) where.push(folder === "root" ? isNull(attachments.folderId) : eq(attachments.folderId, folder));
  // Workspace "Files" view: only standalone files, not ones embedded in notes etc.
  if (qs(req, "standalone") === "1") {
    where.push(isNull(attachments.noteId), isNull(attachments.dsaProblemId), isNull(attachments.lldExerciseId), isNull(attachments.bookId), isNull(attachments.diagramId), ne(attachments.label, BANNER_LABEL));
  }
  const rows = await db
    .select()
    .from(attachments)
    .where(and(...where))
    .orderBy(desc(attachments.createdAt))
    .limit(1000);
  res.json(rows.map(presentAttachment));
});

attachmentsRouter.post("/", upload.single("file"), async (req, res) => {
  const userId = uid(req);
  const file = req.file;
  if (!file) throw badRequest("No file was uploaded");
  const target = parse(attachmentTargetSchema, req.body);
  // Inherit the workspace from the owning item when not given explicitly.
  let workspaceId = target.workspaceId ?? null;
  if (!workspaceId) {
    const owners = [
      [target.noteId, schema.notes],
      [target.dsaProblemId, schema.dsaProblems],
      [target.lldExerciseId, schema.lldExercises],
      [target.bookId, schema.books],
      [target.diagramId, schema.diagrams],
    ] as const;
    for (const [id, table] of owners) {
      if (!id) continue;
      const [row] = await db
        .select({ workspaceId: table.workspaceId })
        .from(table)
        .where(and(eq(table.id, id), eq(table.userId, userId)))
        .limit(1);
      if (row) workspaceId = row.workspaceId;
      break;
    }
  }
  await verifyRefs(userId, { ...target, workspaceId });

  const mime = file.mimetype || "application/octet-stream";
  const fileName = path.basename(file.originalname || "file").slice(0, 200) || "file";
  const storageKey = `${userId}/${randomUUID()}${safeExt(fileName)}`;
  await storage.put(storageKey, file.buffer, mime);
  try {
    const [row] = await db
      .insert(attachments)
      .values({
        userId,
        workspaceId,
        folderId: target.folderId ?? null,
        noteId: target.noteId ?? null,
        dsaProblemId: target.dsaProblemId ?? null,
        lldExerciseId: target.lldExerciseId ?? null,
        bookId: target.bookId ?? null,
        diagramId: target.diagramId ?? null,
        storageKey,
        fileName,
        mimeType: mime,
        sizeBytes: file.size,
        kind: kindFor(mime),
        label: target.label ?? "",
      })
      .returning();
    res.status(201).json(presentAttachment(row!));
  } catch (err) {
    await storage.delete(storageKey).catch(() => {});
    throw err;
  }
});

attachmentsRouter.patch("/:id", async (req, res) => {
  const userId = uid(req);
  const id = param(req);
  const input = parse(attachmentUpdateSchema, req.body);
  const [existing] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
    .limit(1);
  if (!existing) throw notFound("File not found");
  await verifyRefs(userId, input, { workspaceId: existing.workspaceId });
  if (Object.keys(input).length === 0) {
    res.json(presentAttachment(existing));
    return;
  }
  const [row] = await db.update(attachments).set(input).where(eq(attachments.id, id)).returning();
  res.json(presentAttachment(row!));
});

attachmentsRouter.delete("/:id", async (req, res) => {
  const rows = await db
    .delete(attachments)
    .where(and(eq(attachments.id, param(req)), eq(attachments.userId, uid(req))))
    .returning({ id: attachments.id });
  if (rows.length === 0) throw notFound("File not found");
  scheduleDrain();
  res.json({ ok: true });
});

/** Authenticated file download/streaming. */
export const filesRouter = Router();

filesRouter.get("/:id", async (req, res) => {
  const [a] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, param(req)), eq(attachments.userId, uid(req))))
    .limit(1);
  if (!a) throw notFound("File not found");
  const obj = await storage.get(a.storageKey);
  if (!obj) throw notFound("File is missing from storage");
  const inline = INLINE_TYPES.has(a.mimeType) && req.query.download !== "1";
  res.setHeader("Content-Type", INLINE_TYPES.has(a.mimeType) ? a.mimeType : "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  // Chrome's PDF viewer refuses to run inside a sandboxed document, so PDFs get a plain CSP.
  res.setHeader(
    "Content-Security-Policy",
    a.mimeType === "application/pdf" ? "default-src 'none'; object-src 'self'" : "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  );
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
  );
  if (obj.size !== undefined) res.setHeader("Content-Length", String(obj.size));
  obj.stream.on("error", (err) => {
    console.error("[files] stream error", err);
    res.destroy(err);
  });
  obj.stream.pipe(res);
});
