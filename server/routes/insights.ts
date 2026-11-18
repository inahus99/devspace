import { and, count, desc, eq, gt, gte, ilike, inArray, lte, max, or, type SQL, sql } from "drizzle-orm";
import { Router } from "express";
import type { DashboardResponse, DayStat, SearchResult, StatsResponse, WorkspaceSummary } from "../../shared/types.ts";
import { addDaysISO, computeStreaks, totalsByDate } from "../../shared/time.ts";
import { db, schema } from "../db/index.ts";
import { escapeLike } from "../lib/crud.ts";
import { badRequest, localToday, qs, qsDate, uid } from "../lib/http.ts";
import { attachTags } from "../lib/tags.ts";

const {
  workspaces, folders, notes, codeSnippets, dsaProblems, lldExercises, resources, books, activities, readingLogs, tags, contentTags,
} = schema;

// ---------------------------------------------------------------------------
// Global search
// ---------------------------------------------------------------------------

export const searchRouter = Router();

searchRouter.get("/", async (req, res) => {
  const userId = uid(req);
  const q = (qs(req, "q") ?? "").trim();
  if (q.length === 0) {
    res.json([]);
    return;
  }
  const p = `%${escapeLike(q)}%`;
  const per = 6;
  const ws = { workspaceName: workspaces.name, workspaceColor: workspaces.color };

  const [wsRows, folderRows, noteRows, snippetRows, dsaRows, lldRows, resRows, bookRows] = await Promise.all([
    db.select({ id: workspaces.id, title: workspaces.name, subtitle: workspaces.description, ...ws, workspaceId: workspaces.id })
      .from(workspaces).where(and(eq(workspaces.userId, userId), ilike(workspaces.name, p))).limit(per),
    db.select({ id: folders.id, title: folders.name, subtitle: sql<string>`''`, workspaceId: folders.workspaceId, ...ws })
      .from(folders).leftJoin(workspaces, eq(workspaces.id, folders.workspaceId))
      .where(and(eq(folders.userId, userId), ilike(folders.name, p))).limit(per),
    db.select({ id: notes.id, title: notes.title, subtitle: sql<string>`left(${notes.plainText}, 120)`, workspaceId: notes.workspaceId, ...ws })
      .from(notes).leftJoin(workspaces, eq(workspaces.id, notes.workspaceId))
      .where(and(eq(notes.userId, userId), or(ilike(notes.title, p), ilike(notes.plainText, p))))
      .orderBy(desc(notes.updatedAt)).limit(per),
    db.select({ id: codeSnippets.id, title: codeSnippets.title, subtitle: codeSnippets.language, workspaceId: codeSnippets.workspaceId, ...ws })
      .from(codeSnippets).leftJoin(workspaces, eq(workspaces.id, codeSnippets.workspaceId))
      .where(and(eq(codeSnippets.userId, userId), or(ilike(codeSnippets.title, p), ilike(codeSnippets.description, p), ilike(codeSnippets.code, p))))
      .orderBy(desc(codeSnippets.updatedAt)).limit(per),
    db.select({ id: dsaProblems.id, title: dsaProblems.title, subtitle: sql<string>`concat_ws(' · ', nullif(${dsaProblems.platform}, ''), nullif(${dsaProblems.topic}, ''), ${dsaProblems.difficulty})`, workspaceId: dsaProblems.workspaceId, ...ws })
      .from(dsaProblems).leftJoin(workspaces, eq(workspaces.id, dsaProblems.workspaceId))
      .where(and(eq(dsaProblems.userId, userId), or(ilike(dsaProblems.title, p), ilike(dsaProblems.topic, p))))
      .orderBy(desc(dsaProblems.updatedAt)).limit(per),
    db.select({ id: lldExercises.id, title: lldExercises.title, subtitle: sql<string>`left(${lldExercises.problemStatement}, 120)`, workspaceId: lldExercises.workspaceId, ...ws })
      .from(lldExercises).leftJoin(workspaces, eq(workspaces.id, lldExercises.workspaceId))
      .where(and(eq(lldExercises.userId, userId), or(ilike(lldExercises.title, p), ilike(lldExercises.problemStatement, p))))
      .orderBy(desc(lldExercises.updatedAt)).limit(per),
    db.select({ id: resources.id, title: resources.title, subtitle: resources.url, workspaceId: resources.workspaceId, ...ws })
      .from(resources).leftJoin(workspaces, eq(workspaces.id, resources.workspaceId))
      .where(and(eq(resources.userId, userId), or(ilike(resources.title, p), ilike(resources.url, p), ilike(resources.description, p))))
      .orderBy(desc(resources.createdAt)).limit(per),
    db.select({ id: books.id, title: books.title, subtitle: books.author, workspaceId: books.workspaceId, ...ws })
      .from(books).leftJoin(workspaces, eq(workspaces.id, books.workspaceId))
      .where(and(eq(books.userId, userId), or(ilike(books.title, p), ilike(books.author, p))))
      .orderBy(desc(books.updatedAt)).limit(per),
  ]);

  const tag = (type: SearchResult["type"]) => (r: Omit<SearchResult, "type">) => ({ ...r, type });
  const results: SearchResult[] = [
    ...wsRows.map(tag("workspace")),
    ...folderRows.map(tag("folder")),
    ...noteRows.map(tag("note")),
    ...snippetRows.map(tag("snippet")),
    ...dsaRows.map(tag("dsa")),
    ...lldRows.map(tag("lld")),
    ...resRows.map(tag("resource")),
    ...bookRows.map(tag("book")),
  ].map((r) => ({ ...r, subtitle: r.subtitle ?? "", workspaceName: r.workspaceName ?? null, workspaceColor: r.workspaceColor ?? null }));
  res.json(results);
});

export const tagsRouter = Router();
tagsRouter.get("/", async (req, res) => {
  const rows = await db
    .select({ id: tags.id, name: tags.name, userId: tags.userId, createdAt: tags.createdAt, count: count(contentTags.id) })
    .from(tags)
    .leftJoin(contentTags, eq(contentTags.tagId, tags.id))
    .where(eq(tags.userId, uid(req)))
    .groupBy(tags.id)
    .orderBy(tags.name);
  res.json(rows);
});

// ---------------------------------------------------------------------------
// Workspace summaries (shared by dashboard and workspace pages)
// ---------------------------------------------------------------------------

async function workspaceSummaries(userId: string): Promise<WorkspaceSummary[]> {
  const ids = (await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.userId, userId))).map((r) => r.id);
  if (ids.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grouped = (table: any, doneExpr?: SQL<number>) =>
    db
      .select({
        workspaceId: sql<string | null>`${table.workspaceId}`,
        n: count(),
        done: doneExpr ?? sql<number>`0`,
        last: sql<Date | null>`max(${table.updatedAt})`,
      })
      .from(table)
      .where(eq(table.userId, userId))
      .groupBy(table.workspaceId);

  const [n, s, l, d, r, a, timed] = await Promise.all([
    grouped(notes),
    grouped(codeSnippets),
    grouped(lldExercises, sql<number>`count(*) filter (where ${lldExercises.status} = 'completed')::int`),
    grouped(dsaProblems, sql<number>`count(*) filter (where ${dsaProblems.status} in ('solved','mastered'))::int`),
    db.select({ workspaceId: resources.workspaceId, n: count(), done: sql<number>`count(*) filter (where ${resources.status} = 'completed')::int`, last: max(resources.updatedAt) })
      .from(resources).where(eq(resources.userId, userId)).groupBy(resources.workspaceId),
    db.select({ workspaceId: activities.workspaceId, n: count(), done: sql<number>`count(*) filter (where ${activities.completed})::int`, last: max(activities.updatedAt) })
      .from(activities).where(eq(activities.userId, userId)).groupBy(activities.workspaceId),
    db.select({
      workspaceId: activities.workspaceId, date: activities.date, startTime: activities.startTime, endTime: activities.endTime,
      plannedMinutes: activities.plannedMinutes, actualMinutes: activities.actualMinutes, completed: activities.completed,
    }).from(activities).where(and(eq(activities.userId, userId), eq(activities.completed, true))),
  ]);

  const minutes: Record<string, number> = {};
  for (const day of totalsByDate(timed).values())
    for (const [k, v] of Object.entries(day.byWorkspace)) minutes[k] = (minutes[k] ?? 0) + v;

  const find = <R extends { workspaceId: string | null }>(rows: R[], id: string) => rows.find((x) => x.workspaceId === id);
  return ids.map((id) => {
    const ln = find(n, id), ls = find(s, id), ll = find(l, id), ld = find(d, id), lr = find(r, id), la = find(a, id);
    const total = (la?.n ?? 0) + (lr?.n ?? 0) + (ld?.n ?? 0) + (ll?.n ?? 0);
    const done = (la?.done ?? 0) + (lr?.done ?? 0) + (ld?.done ?? 0) + (ll?.done ?? 0);
    const lasts = [ln?.last, ls?.last, ll?.last, ld?.last, lr?.last, la?.last].filter((x): x is Date => !!x);
    const last = lasts.length ? new Date(Math.max(...lasts.map((x) => new Date(x).getTime()))) : null;
    return {
      workspaceId: id,
      notes: ln?.n ?? 0,
      snippets: ls?.n ?? 0,
      resources: lr?.n ?? 0,
      dsaProblems: ld?.n ?? 0,
      lldExercises: ll?.n ?? 0,
      activitiesTotal: la?.n ?? 0,
      activitiesCompleted: la?.done ?? 0,
      minutes: Math.round(minutes[id] ?? 0),
      progress: total > 0 ? done / total : null,
      lastActivityAt: last ? last.toISOString() : null,
    };
  });
}

export const insightsRouter = Router();

insightsRouter.get("/workspace-summaries", async (req, res) => {
  res.json(await workspaceSummaries(uid(req)));
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

insightsRouter.get("/dashboard", async (req, res) => {
  const userId = uid(req);
  const today = localToday(req);

  const [todayActivities, upcoming, recentNotes, recentResources, readingBooks, totals, summaries, recentSnippets, activeDsa, activeLld, activeRes] =
    await Promise.all([
      db.select().from(activities).where(and(eq(activities.userId, userId), eq(activities.date, today)))
        .orderBy(sql`${activities.startTime} asc nulls last`, activities.createdAt),
      db.select().from(activities)
        .where(and(eq(activities.userId, userId), gt(activities.date, today), lte(activities.date, addDaysISO(today, 14)), eq(activities.completed, false)))
        .orderBy(activities.date, sql`${activities.startTime} asc nulls last`).limit(8),
      db.select({
        id: notes.id, userId: notes.userId, workspaceId: notes.workspaceId, folderId: notes.folderId, title: notes.title, format: notes.format,
        isFavorite: notes.isFavorite, createdAt: notes.createdAt, updatedAt: notes.updatedAt, excerpt: sql<string>`left(${notes.plainText}, 220)`,
      }).from(notes).where(eq(notes.userId, userId)).orderBy(desc(notes.updatedAt)).limit(6),
      db.select().from(resources).where(eq(resources.userId, userId)).orderBy(desc(resources.createdAt)).limit(6),
      db.select().from(books).where(and(eq(books.userId, userId), eq(books.status, "reading"))).orderBy(desc(books.updatedAt)).limit(6),
      db.select({ n: count() }).from(activities).where(and(eq(activities.userId, userId), eq(activities.completed, true))),
      workspaceSummaries(userId),
      db.select({ id: codeSnippets.id, title: codeSnippets.title, workspaceId: codeSnippets.workspaceId, updatedAt: codeSnippets.updatedAt })
        .from(codeSnippets).where(eq(codeSnippets.userId, userId)).orderBy(desc(codeSnippets.updatedAt)).limit(4),
      db.select({ id: dsaProblems.id, title: dsaProblems.title, workspaceId: dsaProblems.workspaceId, updatedAt: dsaProblems.updatedAt })
        .from(dsaProblems).where(and(eq(dsaProblems.userId, userId), inArray(dsaProblems.status, ["attempted", "needs_revision"])))
        .orderBy(desc(dsaProblems.updatedAt)).limit(4),
      db.select({ id: lldExercises.id, title: lldExercises.title, workspaceId: lldExercises.workspaceId, updatedAt: lldExercises.updatedAt })
        .from(lldExercises).where(and(eq(lldExercises.userId, userId), eq(lldExercises.status, "in_progress")))
        .orderBy(desc(lldExercises.updatedAt)).limit(4),
      db.select({ id: resources.id, title: resources.title, workspaceId: resources.workspaceId, updatedAt: resources.updatedAt })
        .from(resources).where(and(eq(resources.userId, userId), eq(resources.status, "in_progress")))
        .orderBy(desc(resources.updatedAt)).limit(4),
    ]);

  const iso = (d: Date) => new Date(d).toISOString();
  const continueLearning = [
    ...recentNotes.slice(0, 4).map((x) => ({ type: "note" as const, id: x.id, title: x.title, workspaceId: x.workspaceId, updatedAt: iso(x.updatedAt) })),
    ...recentSnippets.map((x) => ({ type: "snippet" as const, ...x, updatedAt: iso(x.updatedAt) })),
    ...activeDsa.map((x) => ({ type: "dsa" as const, ...x, updatedAt: iso(x.updatedAt) })),
    ...activeLld.map((x) => ({ type: "lld" as const, ...x, updatedAt: iso(x.updatedAt) })),
    ...activeRes.map((x) => ({ type: "resource" as const, ...x, updatedAt: iso(x.updatedAt) })),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  const body = {
    today,
    todayActivities,
    upcoming,
    recentNotes: recentNotes.map((n) => ({ ...n, tags: [] })),
    recentResources: await attachTags(userId, "resourceId", recentResources),
    readingBooks: await attachTags(userId, "bookId", readingBooks),
    continueLearning,
    totalCompletedActivities: totals[0]?.n ?? 0,
    workspaces: summaries,
  };
  res.json(body as unknown as DashboardResponse);
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

insightsRouter.get("/stats", async (req, res) => {
  const userId = uid(req);
  const today = localToday(req);
  const to = qsDate(req, "to") ?? today;
  const from = qsDate(req, "from") ?? addDaysISO(to, -29);
  if (from > to) throw badRequest("from must be on or before to");
  const ws = qs(req, "workspaceId");

  const actWhere = [eq(activities.userId, userId), gte(activities.date, from), lte(activities.date, to)];
  if (ws) actWhere.push(eq(activities.workspaceId, ws));
  const dsaWhere = [eq(dsaProblems.userId, userId)];
  if (ws) dsaWhere.push(eq(dsaProblems.workspaceId, ws));
  const bookWhere = [eq(books.userId, userId)];
  if (ws) bookWhere.push(eq(books.workspaceId, ws));

  const [acts, streakDates, dsaRows, logs, bookRows] = await Promise.all([
    db.select({
      workspaceId: activities.workspaceId, date: activities.date, startTime: activities.startTime, endTime: activities.endTime,
      plannedMinutes: activities.plannedMinutes, actualMinutes: activities.actualMinutes, completed: activities.completed,
    }).from(activities).where(and(...actWhere)),
    db.selectDistinct({ date: activities.date }).from(activities)
      .where(and(eq(activities.userId, userId), eq(activities.completed, true), ws ? eq(activities.workspaceId, ws) : undefined)),
    db.select({ status: dsaProblems.status, difficulty: dsaProblems.difficulty, topic: dsaProblems.topic, solvedOn: dsaProblems.solvedOn, nextReviewOn: dsaProblems.nextReviewOn })
      .from(dsaProblems).where(and(...dsaWhere)),
    db.select({ loggedOn: readingLogs.loggedOn, fromPage: readingLogs.fromPage, toPage: readingLogs.toPage })
      .from(readingLogs).innerJoin(books, eq(books.id, readingLogs.bookId))
      .where(and(eq(readingLogs.userId, userId), gte(readingLogs.loggedOn, from), lte(readingLogs.loggedOn, to), ws ? eq(books.workspaceId, ws) : undefined)),
    db.select({ status: books.status, completedOn: books.completedOn }).from(books).where(and(...bookWhere)),
  ]);

  // Per-day, overlap-safe time accounting.
  const perDay = totalsByDate(acts);
  const days: DayStat[] = [];
  const wsTotals = new Map<string, { minutes: number; completed: number; total: number }>();
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    const t = perDay.get(d);
    days.push({
      date: d,
      plannedMinutes: t?.plannedMinutes ?? 0,
      actualMinutes: t?.actualMinutes ?? 0,
      completed: t?.completed ?? 0,
      total: t?.total ?? 0,
      byWorkspace: t?.byWorkspace ?? {},
    });
    if (days.length > 3700) throw badRequest("Date range is too large");
  }
  for (const a of acts) {
    const key = a.workspaceId ?? "none";
    const cur = wsTotals.get(key) ?? { minutes: 0, completed: 0, total: 0 };
    cur.total++;
    if (a.completed) cur.completed++;
    wsTotals.set(key, cur);
  }
  for (const day of days)
    for (const [k, v] of Object.entries(day.byWorkspace)) {
      const cur = wsTotals.get(k) ?? { minutes: 0, completed: 0, total: 0 };
      cur.minutes += v;
      wsTotals.set(k, cur);
    }

  const totals = days.reduce(
    (acc, d) => ({
      plannedMinutes: acc.plannedMinutes + d.plannedMinutes,
      actualMinutes: acc.actualMinutes + d.actualMinutes,
      completed: acc.completed + d.completed,
      total: acc.total + d.total,
    }),
    { plannedMinutes: 0, actualMinutes: 0, completed: 0, total: 0 },
  );

  // DSA
  const byStatus: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  const topicMap = new Map<string, { count: number; solved: number }>();
  const solvedPerDay: Record<string, number> = {};
  let solvedInRange = 0;
  let dueForReview = 0;
  for (const p of dsaRows) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    byDifficulty[p.difficulty] = (byDifficulty[p.difficulty] ?? 0) + 1;
    const solved = p.status === "solved" || p.status === "mastered";
    const topic = p.topic || "Uncategorised";
    const t = topicMap.get(topic) ?? { count: 0, solved: 0 };
    t.count++;
    if (solved) t.solved++;
    topicMap.set(topic, t);
    if (p.solvedOn && p.solvedOn >= from && p.solvedOn <= to && solved) {
      solvedInRange++;
      solvedPerDay[p.solvedOn] = (solvedPerDay[p.solvedOn] ?? 0) + 1;
    }
    if (p.status === "needs_revision" || (p.nextReviewOn && p.nextReviewOn <= today)) dueForReview++;
  }

  // Reading
  const pagesPerDay: Record<string, number> = {};
  let pagesInRange = 0;
  for (const l of logs) {
    const pages = Math.max(0, l.toPage - l.fromPage);
    pagesInRange += pages;
    pagesPerDay[l.loggedOn] = (pagesPerDay[l.loggedOn] ?? 0) + pages;
  }
  const bookStatus: Record<string, number> = {};
  let completedInRange = 0;
  for (const b of bookRows) {
    bookStatus[b.status] = (bookStatus[b.status] ?? 0) + 1;
    if (b.status === "completed" && b.completedOn && b.completedOn >= from && b.completedOn <= to) completedInRange++;
  }

  const body: StatsResponse = {
    from,
    to,
    days,
    totals,
    streak: computeStreaks(streakDates.map((r) => r.date), today),
    byWorkspace: [...wsTotals.entries()]
      .map(([workspaceId, v]) => ({ workspaceId, minutes: Math.round(v.minutes), completed: v.completed, total: v.total }))
      .sort((a, b) => b.minutes - a.minutes),
    dsa: {
      total: dsaRows.length,
      solved: (byStatus.solved ?? 0) + (byStatus.mastered ?? 0),
      solvedInRange,
      needsRevision: byStatus.needs_revision ?? 0,
      dueForReview,
      byStatus,
      byDifficulty,
      byTopic: [...topicMap.entries()].map(([topic, v]) => ({ topic, ...v })).sort((a, b) => b.count - a.count),
      solvedPerDay,
    },
    reading: { pagesInRange, pagesPerDay, byStatus: bookStatus, completedInRange },
  };
  res.json(body);
});

