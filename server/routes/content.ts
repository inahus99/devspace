import { and, asc, desc, eq, getTableColumns, inArray, lte, or, sql } from "drizzle-orm";
import { Router } from "express";
import { REVIEW_INTERVALS_DAYS } from "../../shared/constants.ts";
import {
  bookCreateSchema,
  bookProgressSchema,
  bookUpdateSchema,
  dsaProblemCreateSchema,
  dsaProblemUpdateSchema,
  dsaReviewSchema,
  dsaSolutionCreateSchema,
  dsaSolutionUpdateSchema,
  highlightCreateSchema,
  highlightUpdateSchema,
  lldCreateSchema,
  lldUpdateSchema,
  noteCreateSchema,
  noteUpdateSchema,
  resourceCreateSchema,
  resourceUpdateSchema,
  snippetCreateSchema,
  diagramCreateSchema,
  diagramUpdateSchema,
  snippetUpdateSchema,
} from "../../shared/schemas.ts";
import { addDaysISO } from "../../shared/time.ts";
import { detectResourceType } from "../../shared/url.ts";
import { db, schema } from "../db/index.ts";
import { crudRouter } from "../lib/crud.ts";
import { localToday, notFound, param, parse, qs, uid } from "../lib/http.ts";
import { verifyRefs } from "../lib/refs.ts";
import { scheduleDrain } from "../storage.ts";

const { notes, codeSnippets, diagrams, resources, dsaProblems, dsaSolutions, lldExercises, books, bookHighlights, readingLogs } =
  schema;

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

const { contentJson: _cj, contentHtml: _ch, contentMarkdown: _cm, plainText: _pt, ...noteListColumns } =
  getTableColumns(notes);
void _cj;
void _ch;
void _cm;
void _pt;

export const notesRouter = crudRouter({
  table: notes,
  createSchema: noteCreateSchema,
  updateSchema: noteUpdateSchema,
  tagTarget: "noteId",
  searchColumns: [notes.title, notes.plainText],
  sortable: { updated: notes.updatedAt, created: notes.createdAt, title: notes.title },
  defaultSort: "updated",
  listColumns: { ...noteListColumns, excerpt: sql<string>`left(${notes.plainText}, 220)` },
  prepare: (input, existing) => {
    const values = { ...input };
    if (!existing && !values.title) values.title = "Untitled";
    if (values.title === "") values.title = "Untitled";
    return values;
  },
});

// ---------------------------------------------------------------------------
// Excalidraw diagrams
// ---------------------------------------------------------------------------

export const diagramsRouter = crudRouter({
  table: diagrams,
  createSchema: diagramCreateSchema,
  updateSchema: diagramUpdateSchema,
  searchColumns: [diagrams.title],
  filters: (req) => [
    qs(req, "bookId") ? eq(diagrams.bookId, qs(req, "bookId")!) : undefined,
    qs(req, "kind") === "board" || qs(req, "kind") === "drawing" ? eq(diagrams.kind, qs(req, "kind") as "board" | "drawing") : undefined,
  ],
  sortable: { updated: diagrams.updatedAt, created: diagrams.createdAt, title: diagrams.title },
  defaultSort: "updated",
  // Lists carry the thumbnail but not the (possibly image-heavy) scene.
  listColumns: {
    id: diagrams.id,
    userId: diagrams.userId,
    workspaceId: diagrams.workspaceId,
    folderId: diagrams.folderId,
    bookId: diagrams.bookId,
    kind: diagrams.kind,
    title: diagrams.title,
    preview: diagrams.preview,
    isFavorite: diagrams.isFavorite,
    createdAt: diagrams.createdAt,
    updatedAt: diagrams.updatedAt,
  },
});

// ---------------------------------------------------------------------------
// Code snippets
// ---------------------------------------------------------------------------

export const snippetsRouter = crudRouter({
  table: codeSnippets,
  createSchema: snippetCreateSchema,
  updateSchema: snippetUpdateSchema,
  tagTarget: "snippetId",
  searchColumns: [codeSnippets.title, codeSnippets.description, codeSnippets.code],
  sortable: { updated: codeSnippets.updatedAt, created: codeSnippets.createdAt, title: codeSnippets.title, language: codeSnippets.language },
  defaultSort: "updated",
  filters: (req) => [
    qs(req, "language") ? eq(codeSnippets.language, qs(req, "language")!) : undefined,
    qs(req, "noteId") ? eq(codeSnippets.noteId, qs(req, "noteId")!) : undefined,
    qs(req, "dsaProblemId") ? eq(codeSnippets.dsaProblemId, qs(req, "dsaProblemId")!) : undefined,
  ],
});

// ---------------------------------------------------------------------------
// Resources — one table; workspace resources ARE library resources.
// ---------------------------------------------------------------------------

export const resourcesRouter = crudRouter({
  table: resources,
  createSchema: resourceCreateSchema,
  updateSchema: resourceUpdateSchema,
  tagTarget: "resourceId",
  searchColumns: [resources.title, resources.url, resources.description],
  sortable: { created: resources.createdAt, updated: resources.updatedAt, title: resources.title, status: resources.status },
  defaultSort: "created",
  filters: (req) => [
    qs(req, "type") ? eq(resources.type, qs(req, "type") as (typeof resources.type.enumValues)[number]) : undefined,
    qs(req, "status") ? eq(resources.status, qs(req, "status") as (typeof resources.status.enumValues)[number]) : undefined,
  ],
  prepare: (input, existing) => {
    const values = { ...input };
    if (!existing && !values.type) values.type = detectResourceType(values.url);
    if (values.status !== undefined && values.status !== existing?.status) {
      values.completedAt = values.status === "completed" ? new Date() : null;
    }
    return values;
  },
});

// ---------------------------------------------------------------------------
// DSA problems, solutions & revision
// ---------------------------------------------------------------------------

export const dsaRouter = Router();

dsaRouter.get("/problems/:id/solutions", async (req, res) => {
  const userId = uid(req);
  const rows = await db
    .select()
    .from(dsaSolutions)
    .where(and(eq(dsaSolutions.problemId, param(req)), eq(dsaSolutions.userId, userId)))
    .orderBy(asc(dsaSolutions.position), asc(dsaSolutions.createdAt));
  res.json(rows);
});

dsaRouter.post("/solutions", async (req, res) => {
  const userId = uid(req);
  const input = parse(dsaSolutionCreateSchema, req.body);
  await verifyRefs(userId, input);
  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(max(${dsaSolutions.position}) + 1, 0)::int` })
    .from(dsaSolutions)
    .where(eq(dsaSolutions.problemId, input.problemId));
  const [row] = await db
    .insert(dsaSolutions)
    .values({ ...input, userId, position: next, title: input.title || `Solution ${next + 1}` })
    .returning();
  await db.update(dsaProblems).set({ updatedAt: new Date() }).where(eq(dsaProblems.id, input.problemId));
  res.status(201).json(row);
});

dsaRouter.patch("/solutions/:id", async (req, res) => {
  const userId = uid(req);
  const input = parse(dsaSolutionUpdateSchema, req.body);
  const [row] = await db
    .update(dsaSolutions)
    .set(Object.keys(input).length ? input : { updatedAt: new Date() })
    .where(and(eq(dsaSolutions.id, param(req)), eq(dsaSolutions.userId, userId)))
    .returning();
  if (!row) throw notFound();
  res.json(row);
});

dsaRouter.delete("/solutions/:id", async (req, res) => {
  const userId = uid(req);
  const rows = await db
    .delete(dsaSolutions)
    .where(and(eq(dsaSolutions.id, param(req)), eq(dsaSolutions.userId, userId)))
    .returning({ id: dsaSolutions.id });
  if (rows.length === 0) throw notFound();
  res.json({ ok: true });
});

dsaRouter.post("/problems/:id/review", async (req, res) => {
  const userId = uid(req);
  const { date, success } = parse(dsaReviewSchema, req.body);
  const [p] = await db
    .select()
    .from(dsaProblems)
    .where(and(eq(dsaProblems.id, param(req)), eq(dsaProblems.userId, userId)))
    .limit(1);
  if (!p) throw notFound();
  const values = success
    ? {
        reviewCount: p.reviewCount + 1,
        lastReviewedOn: date,
        nextReviewOn:
          p.status === "mastered"
            ? null
            : addDaysISO(date, REVIEW_INTERVALS_DAYS[Math.min(p.reviewCount, REVIEW_INTERVALS_DAYS.length - 1)]!),
        status: p.status === "needs_revision" || p.status === "attempted" || p.status === "todo" ? ("solved" as const) : p.status,
        solvedOn: p.solvedOn ?? date,
      }
    : { reviewCount: 0, lastReviewedOn: date, nextReviewOn: addDaysISO(date, 1), status: "needs_revision" as const };
  const [row] = await db.update(dsaProblems).set(values).where(eq(dsaProblems.id, p.id)).returning();
  res.json({ ...row, tags: [] });
});

dsaRouter.use(
  "/problems",
  crudRouter({
    table: dsaProblems,
    createSchema: dsaProblemCreateSchema,
    updateSchema: dsaProblemUpdateSchema,
    tagTarget: "dsaProblemId",
    searchColumns: [dsaProblems.title, dsaProblems.topic, dsaProblems.platform],
    sortable: {
      updated: dsaProblems.updatedAt,
      created: dsaProblems.createdAt,
      title: dsaProblems.title,
      difficulty: dsaProblems.difficulty,
      status: dsaProblems.status,
      topic: dsaProblems.topic,
      solved: dsaProblems.solvedOn,
      nextReview: dsaProblems.nextReviewOn,
    },
    defaultSort: "updated",
    filters: (req) => {
      const out = [];
      const statuses = qs(req, "status")?.split(",").filter(Boolean);
      if (statuses?.length) out.push(inArray(dsaProblems.status, statuses as (typeof dsaProblems.status.enumValues)[number][]));
      const diff = qs(req, "difficulty")?.split(",").filter(Boolean);
      if (diff?.length) out.push(inArray(dsaProblems.difficulty, diff as (typeof dsaProblems.difficulty.enumValues)[number][]));
      if (qs(req, "topic")) out.push(eq(dsaProblems.topic, qs(req, "topic")!));
      if (qs(req, "due") === "1") {
        out.push(or(eq(dsaProblems.status, "needs_revision"), lte(dsaProblems.nextReviewOn, localToday(req))));
      }
      return out;
    },
    prepare: (input, existing, req) => {
      const today = localToday(req);
      const v = { ...input };
      const status = v.status ?? existing?.status ?? "todo";
      const statusChanged = v.status !== undefined && v.status !== existing?.status;
      if (statusChanged || !existing) {
        if (status !== "todo" && !(v.attemptedOn ?? existing?.attemptedOn)) v.attemptedOn = today;
        if ((status === "solved" || status === "mastered") && !(v.solvedOn ?? existing?.solvedOn)) v.solvedOn = today;
        if (status === "solved" && v.nextReviewOn === undefined && !existing?.nextReviewOn) v.nextReviewOn = addDaysISO(today, 3);
        if (status === "needs_revision" && v.nextReviewOn === undefined) v.nextReviewOn = today;
        if (status === "mastered" && v.nextReviewOn === undefined) v.nextReviewOn = null;
        if (status === "todo") {
          if (v.attemptedOn === undefined) v.attemptedOn = null;
          if (v.solvedOn === undefined) v.solvedOn = null;
          if (v.nextReviewOn === undefined) v.nextReviewOn = null;
        }
      }
      return v;
    },
  }),
);

// ---------------------------------------------------------------------------
// LLD exercises
// ---------------------------------------------------------------------------

export const lldRouter = crudRouter({
  table: lldExercises,
  createSchema: lldCreateSchema,
  updateSchema: lldUpdateSchema,
  tagTarget: "lldExerciseId",
  searchColumns: [lldExercises.title, lldExercises.problemStatement],
  sortable: { updated: lldExercises.updatedAt, created: lldExercises.createdAt, title: lldExercises.title, status: lldExercises.status },
  defaultSort: "updated",
  filters: (req) => [
    qs(req, "status") ? eq(lldExercises.status, qs(req, "status") as (typeof lldExercises.status.enumValues)[number]) : undefined,
  ],
  prepare: (input, existing, req) => {
    const v = { ...input };
    if (v.status !== undefined && v.status !== existing?.status) {
      v.completedOn = v.status === "completed" ? (existing?.completedOn ?? localToday(req)) : null;
    }
    return v;
  },
});

// ---------------------------------------------------------------------------
// Books, reading progress & highlights
// ---------------------------------------------------------------------------

export const booksRouter = Router();

async function ownedBook(userId: string, id: string) {
  const [b] = await db
    .select()
    .from(books)
    .where(and(eq(books.id, id), eq(books.userId, userId)))
    .limit(1);
  if (!b) throw notFound();
  return b;
}

booksRouter.post("/:id/progress", async (req, res) => {
  const userId = uid(req);
  const book = await ownedBook(userId, param(req));
  const { currentPage, date } = parse(bookProgressSchema, req.body);
  const page = book.totalPages > 0 ? Math.min(currentPage, book.totalPages) : currentPage;
  const values: Partial<typeof books.$inferInsert> = { currentPage: page };
  if (page > 0 && (book.status === "want_to_read" || book.status === "paused")) {
    values.status = "reading";
    values.startedOn = book.startedOn ?? date;
  }
  if (book.totalPages > 0 && page >= book.totalPages) {
    values.status = "completed";
    values.completedOn = book.completedOn ?? date;
    values.startedOn = book.startedOn ?? date;
  } else if (book.status === "completed" && page < book.totalPages) {
    values.status = "reading";
    values.completedOn = null;
  }
  const row = await db.transaction(async (tx) => {
    if (page !== book.currentPage) {
      // Reading on in the same session (e.g. the PDF reader saving as you go) extends today's
      // last log instead of adding a new one per save.
      const [last] =
        page > book.currentPage
          ? await tx
              .select({ id: readingLogs.id })
              .from(readingLogs)
              .where(
                and(
                  eq(readingLogs.bookId, book.id),
                  eq(readingLogs.userId, userId),
                  eq(readingLogs.loggedOn, date),
                  eq(readingLogs.toPage, book.currentPage),
                  lte(readingLogs.fromPage, book.currentPage),
                ),
              )
              .orderBy(desc(readingLogs.createdAt))
              .limit(1)
          : [];
      if (last) await tx.update(readingLogs).set({ toPage: page }).where(eq(readingLogs.id, last.id));
      else await tx.insert(readingLogs).values({ userId, bookId: book.id, loggedOn: date, fromPage: book.currentPage, toPage: page });
    }
    const [updated] = await tx.update(books).set(values).where(eq(books.id, book.id)).returning();
    return updated!;
  });
  res.json({ ...row, tags: [] });
});

booksRouter.get("/:id/logs", async (req, res) => {
  const userId = uid(req);
  const rows = await db
    .select()
    .from(readingLogs)
    .where(and(eq(readingLogs.bookId, param(req)), eq(readingLogs.userId, userId)))
    .orderBy(sql`${readingLogs.loggedOn} desc, ${readingLogs.createdAt} desc`);
  res.json(rows);
});

booksRouter.delete("/logs/:id", async (req, res) => {
  const userId = uid(req);
  const rows = await db
    .delete(readingLogs)
    .where(and(eq(readingLogs.id, param(req)), eq(readingLogs.userId, userId)))
    .returning({ id: readingLogs.id });
  if (rows.length === 0) throw notFound();
  res.json({ ok: true });
});

booksRouter.get("/:id/highlights", async (req, res) => {
  const userId = uid(req);
  const rows = await db
    .select()
    .from(bookHighlights)
    .where(and(eq(bookHighlights.bookId, param(req)), eq(bookHighlights.userId, userId)))
    .orderBy(sql`${bookHighlights.page} asc nulls last, ${bookHighlights.createdAt} asc`);
  res.json(rows);
});

booksRouter.post("/:id/highlights", async (req, res) => {
  const userId = uid(req);
  const book = await ownedBook(userId, param(req));
  const input = parse(highlightCreateSchema, req.body);
  const [row] = await db.insert(bookHighlights).values({ ...input, userId, bookId: book.id }).returning();
  res.status(201).json(row);
});

booksRouter.patch("/highlights/:id", async (req, res) => {
  const userId = uid(req);
  const input = parse(highlightUpdateSchema, req.body);
  if (Object.keys(input).length === 0) throw notFound();
  const [row] = await db
    .update(bookHighlights)
    .set(input)
    .where(and(eq(bookHighlights.id, param(req)), eq(bookHighlights.userId, userId)))
    .returning();
  if (!row) throw notFound();
  res.json(row);
});

booksRouter.delete("/highlights/:id", async (req, res) => {
  const userId = uid(req);
  const rows = await db
    .delete(bookHighlights)
    .where(and(eq(bookHighlights.id, param(req)), eq(bookHighlights.userId, userId)))
    .returning({ id: bookHighlights.id });
  if (rows.length === 0) throw notFound();
  res.json({ ok: true });
});

booksRouter.use(
  "/",
  crudRouter({
    table: books,
    createSchema: bookCreateSchema,
    updateSchema: bookUpdateSchema,
    tagTarget: "bookId",
    searchColumns: [books.title, books.author],
    sortable: { updated: books.updatedAt, created: books.createdAt, title: books.title, author: books.author },
    defaultSort: "updated",
    filters: (req) => [
      qs(req, "status") ? eq(books.status, qs(req, "status") as (typeof books.status.enumValues)[number]) : undefined,
    ],
    prepare: (input, existing, req) => {
      const today = localToday(req);
      const v = { ...input };
      const total = v.totalPages ?? existing?.totalPages ?? 0;
      if (v.currentPage !== undefined && total > 0) v.currentPage = Math.min(v.currentPage, total);
      if (v.status !== undefined && v.status !== existing?.status) {
        if (v.status === "reading" && !(v.startedOn ?? existing?.startedOn)) v.startedOn = today;
        if (v.status === "completed") {
          if (!(v.completedOn ?? existing?.completedOn)) v.completedOn = today;
          if (!(v.startedOn ?? existing?.startedOn)) v.startedOn = today;
          if (total > 0 && v.currentPage === undefined) v.currentPage = total;
        } else if (existing?.status === "completed" && v.completedOn === undefined) {
          v.completedOn = null;
        }
      }
      return v;
    },
    afterWrite: async (row, existing, req) => {
      const userId = uid(req);
      // Pages jumped by marking a book complete still count as reading in analytics.
      if (existing && row.currentPage !== existing.currentPage && row.status === "completed" && existing.status !== "completed") {
        await db.insert(readingLogs).values({
          userId,
          bookId: row.id,
          loggedOn: row.completedOn ?? localToday(req),
          fromPage: existing.currentPage,
          toPage: row.currentPage,
        });
      }
      // Replacing an uploaded cover removes the previous file.
      const old = typeof existing?.coverUrl === "string" ? existing.coverUrl.match(/^\/api\/files\/([0-9a-f-]{36})$/) : null;
      if (old && existing!.coverUrl !== row.coverUrl) {
        await db.delete(schema.attachments).where(and(eq(schema.attachments.id, old[1]!), eq(schema.attachments.userId, userId)));
        scheduleDrain();
      }
    },
  }),
);
