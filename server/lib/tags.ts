import { and, eq, inArray } from "drizzle-orm";
import { db, schema, type Tx } from "../db/index.ts";

export type TagTarget = "noteId" | "snippetId" | "resourceId" | "dsaProblemId" | "lldExerciseId" | "bookId";

export function normalizeTags(names: string[]): string[] {
  return [...new Set(names.map((n) => n.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean))].slice(0, 30);
}

export async function setTags(tx: Tx, userId: string, target: TagTarget, contentId: string, names: string[]) {
  const col = schema.contentTags[target];
  await tx.delete(schema.contentTags).where(and(eq(col, contentId), eq(schema.contentTags.userId, userId)));
  const clean = normalizeTags(names);
  if (clean.length === 0) return;
  await tx
    .insert(schema.tags)
    .values(clean.map((name) => ({ userId, name })))
    .onConflictDoNothing();
  const rows = await tx
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(and(eq(schema.tags.userId, userId), inArray(schema.tags.name, clean)));
  await tx.insert(schema.contentTags).values(rows.map((r) => ({ userId, tagId: r.id, [target]: contentId })));
}

export async function loadTags(userId: string, target: TagTarget, ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const col = schema.contentTags[target];
  const rows = await db
    .select({ contentId: col, name: schema.tags.name })
    .from(schema.contentTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.contentTags.tagId))
    .where(and(eq(schema.contentTags.userId, userId), inArray(col, ids)));
  for (const r of rows) {
    if (!r.contentId) continue;
    const list = map.get(r.contentId);
    if (list) list.push(r.name);
    else map.set(r.contentId, [r.name]);
  }
  for (const list of map.values()) list.sort();
  return map;
}

export async function attachTags<T extends { id: string }>(
  userId: string,
  target: TagTarget,
  rows: T[],
): Promise<(T & { tags: string[] })[]> {
  const map = await loadTags(userId, target, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, tags: map.get(r.id) ?? [] }));
}
