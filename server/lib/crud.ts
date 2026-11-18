/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, asc, desc, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { type Request, Router } from "express";
import type { z } from "zod";
import { db, schema } from "../db/index.ts";
import { scheduleDrain } from "../storage.ts";
import { notFound, param, parse, qs, uid } from "./http.ts";
import { verifyRefs } from "./refs.ts";
import { attachTags, normalizeTags, setTags, type TagTarget } from "./tags.ts";

type Row = Record<string, any> & { id: string };

export interface CrudConfig {
  /** A user-owned table with id, userId (and usually workspaceId, folderId, isFavorite). */
  table: any;
  createSchema: z.ZodObject<any>;
  updateSchema: z.ZodObject<any>;
  tagTarget?: TagTarget;
  /** Columns matched by ?q= (ILIKE). */
  searchColumns: PgColumn[];
  /** ?sort= keys. */
  sortable: Record<string, PgColumn>;
  defaultSort: string;
  defaultOrder?: "asc" | "desc";
  /** Column subset for list responses (e.g. omit heavy note bodies). */
  listColumns?: Record<string, any>;
  /** Extra list filters derived from the query string. */
  filters?: (req: Request) => (SQL | undefined)[];
  /** Derive/normalise values before insert/update. `existing` is null on create. */
  prepare?: (input: Record<string, any>, existing: Row | null, req: Request) => Record<string, any> | Promise<Record<string, any>>;
  /** Side effects after a successful create/update (existing is null on create). */
  afterWrite?: (row: Row, existing: Row | null, req: Request) => Promise<void>;
  /** Post-process rows (e.g. compute an excerpt). */
  present?: (row: Row) => Row;
}

export function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Standard REST router for an owned entity:
 *   GET /           list   (?workspaceId ?folderId=<id|root> ?q ?tag ?favorite=1 ?sort ?order ?limit ?offset)
 *   GET /:id        read
 *   POST /          create
 *   PATCH /:id      update
 *   DELETE /:id     delete
 * Every query is scoped to the signed-in user.
 */
export function crudRouter(cfg: CrudConfig): Router {
  const t = cfg.table;
  const router = Router();
  const present = (r: Row) => (cfg.present ? cfg.present(r) : r);

  async function withTags(rows: Row[], userId: string): Promise<Row[]> {
    const out = cfg.tagTarget ? await attachTags(userId, cfg.tagTarget, rows) : rows;
    return out.map(present);
  }

  async function getOwned(userId: string, id: string): Promise<Row> {
    const [row] = await db
      .select()
      .from(t)
      .where(and(eq(t.id, id), eq(t.userId, userId)))
      .limit(1);
    if (!row) throw notFound();
    return row as Row;
  }

  router.get("/", async (req, res) => {
    const userId = uid(req);
    const where: (SQL | undefined)[] = [eq(t.userId, userId)];
    const ws = qs(req, "workspaceId");
    if (ws && t.workspaceId) where.push(ws === "none" ? isNull(t.workspaceId) : eq(t.workspaceId, ws));
    const folder = qs(req, "folderId");
    if (folder && t.folderId) where.push(folder === "root" ? isNull(t.folderId) : eq(t.folderId, folder));
    if (qs(req, "favorite") === "1" && t.isFavorite) where.push(eq(t.isFavorite, true));
    const q = qs(req, "q");
    if (q && cfg.searchColumns.length) {
      const pattern = `%${escapeLike(q)}%`;
      where.push(or(...cfg.searchColumns.map((c) => ilike(c, pattern))));
    }
    const tag = qs(req, "tag");
    if (tag && cfg.tagTarget) {
      const col = schema.contentTags[cfg.tagTarget];
      const tagged = db
        .select({ id: col })
        .from(schema.contentTags)
        .innerJoin(schema.tags, eq(schema.tags.id, schema.contentTags.tagId))
        .where(and(eq(schema.contentTags.userId, userId), eq(schema.tags.name, normalizeTags([tag])[0] ?? "")));
      where.push(inArray(t.id, tagged as any));
    }
    if (cfg.filters) where.push(...cfg.filters(req));

    const sortKey = qs(req, "sort") ?? cfg.defaultSort;
    const sortCol = cfg.sortable[sortKey] ?? cfg.sortable[cfg.defaultSort]!;
    const order = (qs(req, "order") ?? cfg.defaultOrder ?? "desc") === "asc" ? asc : desc;
    const limit = Math.min(Number(qs(req, "limit") ?? 500) || 500, 2000);
    const offset = Math.max(Number(qs(req, "offset") ?? 0) || 0, 0);

    const rows = await (cfg.listColumns ? db.select(cfg.listColumns) : db.select())
      .from(t)
      .where(and(...where))
      .orderBy(order(sortCol), desc(t.id))
      .limit(limit)
      .offset(offset);
    res.json(await withTags(rows as Row[], userId));
  });

  router.get("/:id", async (req, res) => {
    const userId = uid(req);
    const row = await getOwned(userId, param(req));
    res.json((await withTags([row], userId))[0]);
  });

  router.post("/", async (req, res) => {
    const userId = uid(req);
    const { tags, ...input } = parse(cfg.createSchema, req.body) as Record<string, any>;
    await verifyRefs(userId, input);
    const values = cfg.prepare ? await cfg.prepare(input, null, req) : input;
    const row = await db.transaction(async (tx) => {
      const [created] = (await tx
        .insert(t)
        .values({ ...values, userId })
        .returning()) as Row[];
      if (cfg.tagTarget && Array.isArray(tags)) await setTags(tx, userId, cfg.tagTarget, created!.id, tags);
      return created!;
    });
    if (cfg.afterWrite) await cfg.afterWrite(row, null, req);
    res.status(201).json((await withTags([row], userId))[0]);
  });

  router.patch("/:id", async (req, res) => {
    const userId = uid(req);
    const id = param(req);
    const existing = await getOwned(userId, id);
    const { tags, ...input } = parse(cfg.updateSchema, req.body) as Record<string, any>;
    await verifyRefs(userId, input, { workspaceId: existing.workspaceId ?? null });
    // Moving to another workspace detaches the item from its old folder.
    if (
      t.folderId &&
      input.workspaceId !== undefined &&
      input.workspaceId !== existing.workspaceId &&
      input.folderId === undefined
    )
      input.folderId = null;
    const values = cfg.prepare ? await cfg.prepare(input, existing, req) : input;
    const row = await db.transaction(async (tx) => {
      let updated = existing;
      if (Object.keys(values).length > 0) {
        [updated] = (await tx
          .update(t)
          .set(values)
          .where(and(eq(t.id, id), eq(t.userId, userId)))
          .returning()) as Row[];
      } else if (Array.isArray(tags) && t.updatedAt) {
        [updated] = (await tx
          .update(t)
          .set({ updatedAt: new Date() })
          .where(and(eq(t.id, id), eq(t.userId, userId)))
          .returning()) as Row[];
      }
      if (cfg.tagTarget && Array.isArray(tags)) await setTags(tx, userId, cfg.tagTarget, id, tags);
      return updated!;
    });
    if (cfg.afterWrite) await cfg.afterWrite(row, existing, req);
    res.json((await withTags([row], userId))[0]);
  });

  router.delete("/:id", async (req, res) => {
    const userId = uid(req);
    const deleted = await db
      .delete(t)
      .where(and(eq(t.id, param(req)), eq(t.userId, userId)))
      .returning({ id: t.id });
    if (deleted.length === 0) throw notFound();
    scheduleDrain();
    res.json({ ok: true });
  });

  return router;
}
