import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Router } from "express";
import {
  folderCreateSchema,
  folderUpdateSchema,
  reorderSchema,
  workspaceCreateSchema,
  workspaceUpdateSchema,
} from "../../shared/schemas.ts";
import { db, schema } from "../db/index.ts";
import { badRequest, notFound, param, parse, qs, uid } from "../lib/http.ts";
import { verifyRefs } from "../lib/refs.ts";
import { scheduleDrain } from "../storage.ts";
import { normalizeImageRef, releaseReplacedImage } from "../lib/images.ts";

const { workspaces, folders } = schema;

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export const workspacesRouter = Router();

workspacesRouter.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, uid(req)))
    .orderBy(asc(workspaces.position), asc(workspaces.createdAt));
  res.json(rows);
});

workspacesRouter.get("/:id", async (req, res) => {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, param(req)), eq(workspaces.userId, uid(req))))
    .limit(1);
  if (!row) throw notFound("Workspace not found");
  res.json(row);
});

workspacesRouter.post("/", async (req, res) => {
  const userId = uid(req);
  const input = parse(workspaceCreateSchema, req.body);
  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(max(${workspaces.position}) + 1, 0)::int` })
    .from(workspaces)
    .where(eq(workspaces.userId, userId));
  const [row] = await db
    .insert(workspaces)
    .values({ ...input, bannerUrl: normalizeImageRef(input.bannerUrl), userId, position: next })
    .returning();
  res.status(201).json(row);
});

workspacesRouter.post("/reorder", async (req, res) => {
  const userId = uid(req);
  const { ids } = parse(reorderSchema, req.body);
  await db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.userId, userId), inArray(workspaces.id, ids)));
    if (owned.length !== new Set(ids).size) throw badRequest("Unknown workspace in order");
    for (const [i, id] of ids.entries()) {
      await tx.update(workspaces).set({ position: i }).where(and(eq(workspaces.id, id), eq(workspaces.userId, userId)));
    }
  });
  res.json({ ok: true });
});

workspacesRouter.patch("/:id", async (req, res) => {
  const userId = uid(req);
  const { archived, ...input } = parse(workspaceUpdateSchema, req.body);
  const values: Partial<typeof workspaces.$inferInsert> = { ...input };
  if (input.bannerUrl !== undefined) values.bannerUrl = normalizeImageRef(input.bannerUrl);
  const [before] = await db
    .select({ bannerUrl: workspaces.bannerUrl })
    .from(workspaces)
    .where(and(eq(workspaces.id, param(req)), eq(workspaces.userId, userId)));
  if (!before) throw notFound("Workspace not found");
  if (archived !== undefined) values.archivedAt = archived ? new Date() : null;
  if (Object.keys(values).length === 0) throw badRequest("Nothing to update");
  const [row] = await db
    .update(workspaces)
    .set(values)
    .where(and(eq(workspaces.id, param(req)), eq(workspaces.userId, userId)))
    .returning();
  if (!row) throw notFound("Workspace not found");
  await releaseReplacedImage(userId, before.bannerUrl, row.bannerUrl);
  res.json(row);
});

workspacesRouter.delete("/:id", async (req, res) => {
  const rows = await db
    .delete(workspaces)
    .where(and(eq(workspaces.id, param(req)), eq(workspaces.userId, uid(req))))
    .returning({ id: workspaces.id });
  if (rows.length === 0) throw notFound("Workspace not found");
  scheduleDrain();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Folders (adjacency list: parent_id, ordered by position among siblings)
// ---------------------------------------------------------------------------

export const foldersRouter = Router();

async function ownedFolder(userId: string, id: string) {
  const [f] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, userId)))
    .limit(1);
  if (!f) throw notFound("Folder not found");
  return f;
}

function siblingsWhere(workspaceId: string, parentId: string | null) {
  return and(eq(folders.workspaceId, workspaceId), parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId));
}

foldersRouter.get("/", async (req, res) => {
  const userId = uid(req);
  const ws = qs(req, "workspaceId");
  const rows = await db
    .select()
    .from(folders)
    .where(and(eq(folders.userId, userId), ws ? eq(folders.workspaceId, ws) : undefined))
    .orderBy(asc(folders.position), asc(folders.createdAt));
  res.json(rows);
});

foldersRouter.post("/", async (req, res) => {
  const userId = uid(req);
  const input = parse(folderCreateSchema, req.body);
  await verifyRefs(userId, input);
  const parentId = input.parentId ?? null;
  if (parentId) {
    const parent = await ownedFolder(userId, parentId);
    if (parent.workspaceId !== input.workspaceId) throw badRequest("Parent folder belongs to a different workspace");
  }
  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(max(${folders.position}) + 1, 0)::int` })
    .from(folders)
    .where(siblingsWhere(input.workspaceId, parentId));
  const [row] = await db
    .insert(folders)
    .values({ userId, workspaceId: input.workspaceId, parentId, name: input.name, position: next })
    .returning();
  res.status(201).json(row);
});

foldersRouter.patch("/:id", async (req, res) => {
  const userId = uid(req);
  const folder = await ownedFolder(userId, param(req));
  const input = parse(folderUpdateSchema, req.body);

  const moving = input.parentId !== undefined && (input.parentId ?? null) !== folder.parentId;
  const reposition = input.position !== undefined;
  const newParent = input.parentId !== undefined ? (input.parentId ?? null) : folder.parentId;

  if (moving && newParent) {
    const parent = await ownedFolder(userId, newParent);
    if (parent.workspaceId !== folder.workspaceId) throw badRequest("Cannot move a folder to another workspace");
    // Reject cycles: the new parent may not be this folder or any of its descendants.
    const result = await db.execute<{ id: string }>(sql`
      WITH RECURSIVE sub AS (
        SELECT id FROM folders WHERE id = ${folder.id}
        UNION ALL
        SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
      ) SELECT id FROM sub`);
    if (result.rows.some((r) => r.id === newParent)) throw badRequest("A folder cannot be moved inside itself");
  }

  const fields: Partial<typeof folders.$inferInsert> = {};
  if (input.name !== undefined) fields.name = input.name;
  if (moving) fields.parentId = newParent;
  if (input.bannerUrl !== undefined) fields.bannerUrl = normalizeImageRef(input.bannerUrl);
  if (input.bannerPosition !== undefined) fields.bannerPosition = input.bannerPosition;

  const row = await db.transaction(async (tx) => {
    if (Object.keys(fields).length > 0) {
      await tx.update(folders).set(fields).where(eq(folders.id, folder.id));
    }
    if (moving || reposition) {
      const siblings = await tx
        .select({ id: folders.id })
        .from(folders)
        .where(siblingsWhere(folder.workspaceId, newParent))
        .orderBy(asc(folders.position), asc(folders.createdAt));
      const order = siblings.map((s) => s.id).filter((id) => id !== folder.id);
      const index = Math.min(input.position ?? order.length, order.length);
      order.splice(index, 0, folder.id);
      for (const [i, id] of order.entries()) await tx.update(folders).set({ position: i }).where(eq(folders.id, id));
    }
    const [updated] = await tx.select().from(folders).where(eq(folders.id, folder.id));
    return updated!;
  });
  await releaseReplacedImage(userId, folder.bannerUrl, row.bannerUrl);
  res.json(row);
});

foldersRouter.delete("/:id", async (req, res) => {
  const userId = uid(req);
  const folder = await ownedFolder(userId, param(req));
  // Sub-folders cascade; content inside moves to the workspace root (folder_id SET NULL).
  // Banners of the folder and its sub-folders go with it.
  const tree = await db.execute<{ banner_url: string | null }>(sql`
    WITH RECURSIVE sub AS (
      SELECT id, banner_url FROM folders WHERE id = ${folder.id}
      UNION ALL
      SELECT f.id, f.banner_url FROM folders f JOIN sub ON f.parent_id = sub.id
    ) SELECT banner_url FROM sub WHERE banner_url IS NOT NULL`);
  await db.delete(folders).where(eq(folders.id, folder.id));
  for (const r of tree.rows) await releaseReplacedImage(userId, r.banner_url, null);
  res.json({ ok: true });
});
