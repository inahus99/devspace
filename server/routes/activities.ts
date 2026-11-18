import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { type Request, Router } from "express";
import { activityCreateSchema, activityUpdateSchema } from "../../shared/schemas.ts";
import { intervalMinutes } from "../../shared/time.ts";
import { db, schema } from "../db/index.ts";
import { badRequest, notFound, param, parse, qs, qsDate, uid } from "../lib/http.ts";
import { verifyRefs } from "../lib/refs.ts";

const { activities, notes, codeSnippets, dsaProblems, lldExercises, resources, books } = schema;
type ActivityRow = typeof activities.$inferSelect;

export const activitiesRouter = Router();

const linkColumns = {
  noteTitle: notes.title,
  snippetTitle: codeSnippets.title,
  dsaTitle: dsaProblems.title,
  lldTitle: lldExercises.title,
  resourceTitle: resources.title,
  resourceUrl: resources.url,
  bookTitle: books.title,
};

function selectWithLinks() {
  return db
    .select({ activity: activities, ...linkColumns })
    .from(activities)
    .leftJoin(notes, eq(notes.id, activities.noteId))
    .leftJoin(codeSnippets, eq(codeSnippets.id, activities.snippetId))
    .leftJoin(dsaProblems, eq(dsaProblems.id, activities.dsaProblemId))
    .leftJoin(lldExercises, eq(lldExercises.id, activities.lldExerciseId))
    .leftJoin(resources, eq(resources.id, activities.resourceId))
    .leftJoin(books, eq(books.id, activities.bookId));
}

type LinkedRow = Awaited<ReturnType<ReturnType<typeof selectWithLinks>["where"]>>[number];

/** Flatten the joined row into an activity with a single `link` descriptor. */
function present(r: LinkedRow) {
  const a = r.activity;
  let link: { type: string; id: string; title: string; url?: string } | null = null;
  if (a.noteId) link = { type: "note", id: a.noteId, title: r.noteTitle ?? "Note" };
  else if (a.dsaProblemId) link = { type: "dsa", id: a.dsaProblemId, title: r.dsaTitle ?? "DSA problem" };
  else if (a.lldExerciseId) link = { type: "lld", id: a.lldExerciseId, title: r.lldTitle ?? "LLD exercise" };
  else if (a.snippetId) link = { type: "snippet", id: a.snippetId, title: r.snippetTitle ?? "Snippet" };
  else if (a.resourceId)
    link = { type: "resource", id: a.resourceId, title: r.resourceTitle ?? "Resource", url: r.resourceUrl ?? undefined };
  else if (a.bookId) link = { type: "book", id: a.bookId, title: r.bookTitle ?? "Book" };
  return { ...a, link };
}

async function getOne(userId: string, id: string) {
  const [row] = await selectWithLinks()
    .where(and(eq(activities.id, id), eq(activities.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Activity not found");
  return present(row);
}

/** Normalise times, planned/actual minutes and completion timestamps. */
function prepare(input: Record<string, unknown>, existing: ActivityRow | null) {
  const v = { ...input } as Partial<typeof activities.$inferInsert> & Record<string, unknown>;
  const start = (v.startTime !== undefined ? v.startTime : existing?.startTime) ?? null;
  const end = (v.endTime !== undefined ? v.endTime : existing?.endTime) ?? null;
  if (start && end) {
    const span = intervalMinutes(start, end);
    if (span === null) throw badRequest("End time must be after start time");
    if (v.startTime !== undefined || v.endTime !== undefined || v.plannedMinutes === undefined) v.plannedMinutes = span;
  } else if (!start && end) {
    throw badRequest("Set a start time before an end time");
  }
  const completed = v.completed ?? existing?.completed ?? false;
  if (v.completed !== undefined && v.completed !== existing?.completed) {
    v.completedAt = v.completed ? new Date() : null;
  }
  // Completing without recording time: assume the planned session happened.
  // Stored explicitly so it is visible and editable — never silently inferred later.
  if (completed && v.actualMinutes === undefined && (existing?.actualMinutes ?? 0) === 0 && v.completed === true) {
    v.actualMinutes = (start && end ? intervalMinutes(start, end) : null) ?? v.plannedMinutes ?? existing?.plannedMinutes ?? 0;
  }
  return v;
}

function listFilters(req: Request, userId: string): SQL[] {
  const where: SQL[] = [eq(activities.userId, userId)];
  const from = qsDate(req, "from");
  const to = qsDate(req, "to");
  if (from) where.push(gte(activities.date, from));
  if (to) where.push(lte(activities.date, to));
  const ws = qs(req, "workspaceId");
  if (ws) where.push(eq(activities.workspaceId, ws));
  const completed = qs(req, "completed");
  if (completed === "1" || completed === "0") where.push(eq(activities.completed, completed === "1"));
  for (const key of ["noteId", "dsaProblemId", "lldExerciseId", "snippetId", "resourceId", "bookId"] as const) {
    const v = qs(req, key);
    if (v) where.push(eq(activities[key], v));
  }
  return where;
}

activitiesRouter.get("/", async (req, res) => {
  const userId = uid(req);
  const rows = await selectWithLinks()
    .where(and(...listFilters(req, userId)))
    .orderBy(asc(activities.date), asc(activities.startTime), asc(activities.createdAt))
    .limit(Math.min(Number(qs(req, "limit") ?? 2000) || 2000, 5000));
  res.json(rows.map(present));
});

activitiesRouter.get("/:id", async (req, res) => {
  res.json(await getOne(uid(req), param(req)));
});

activitiesRouter.post("/", async (req, res) => {
  const userId = uid(req);
  const input = parse(activityCreateSchema, req.body);
  await verifyRefs(userId, input);
  const values = prepare(input, null);
  const [row] = await db
    .insert(activities)
    .values({ ...(values as typeof activities.$inferInsert), userId })
    .returning();
  res.status(201).json(await getOne(userId, row!.id));
});

activitiesRouter.patch("/:id", async (req, res) => {
  const userId = uid(req);
  const id = param(req);
  const [existing] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.userId, userId)))
    .limit(1);
  if (!existing) throw notFound("Activity not found");
  const input = parse(activityUpdateSchema, req.body);
  await verifyRefs(userId, input);
  const values = prepare(input, existing);
  if (Object.keys(values).length > 0) {
    await db.update(activities).set(values).where(eq(activities.id, id));
  }
  res.json(await getOne(userId, id));
});

activitiesRouter.delete("/:id", async (req, res) => {
  const rows = await db
    .delete(activities)
    .where(and(eq(activities.id, param(req)), eq(activities.userId, uid(req))))
    .returning({ id: activities.id });
  if (rows.length === 0) throw notFound("Activity not found");
  res.json({ ok: true });
});
