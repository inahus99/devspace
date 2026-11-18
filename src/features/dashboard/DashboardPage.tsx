import { addMonths, endOfMonth, format, startOfMonth, startOfWeek } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  Flame,
  FolderPlus,
  Link2,
  type LucideIcon,
  Plus,
  Sparkles,
  Target,
  Timer,
} from "lucide-react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { RESOURCE_TYPE_LABELS } from "@shared/constants";
import type { DashboardResponse, Workspace } from "@shared/types";
import { addDaysISO, formatMinutes } from "@shared/time";
import { EmptyState, ErrorState, LoadingRows, Page, Section, Stat } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { fromISODate, timeAgo, toISODate, todayISO } from "@/lib/dates";
import { useCreate, useDashboard, useList, useMe, useStats, useWorkspaceMap, useWorkspaces } from "@/lib/queries";
import { contentHref, routes } from "@/lib/routes";
import { useUi } from "@/stores/ui";
import { MonthHeatmap } from "../analytics/Heatmap";
import { ActivityItem } from "../planner/ActivityItem";
import { sortActivities } from "../planner/lib";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const CONTINUE_ICONS: Record<DashboardResponse["continueLearning"][number]["type"], LucideIcon> = {
  note: FileText,
  snippet: Code2,
  dsa: Target,
  lld: Boxes,
  resource: Link2,
};
const CONTINUE_LABELS: Record<DashboardResponse["continueLearning"][number]["type"], string> = {
  note: "Note",
  snippet: "Snippet",
  dsa: "DSA problem",
  lld: "LLD exercise",
  resource: "Resource",
};

export default function DashboardPage() {
  const today = todayISO();
  const me = useMe().data;
  const weekStartsOn = (me?.settings?.weekStartsOn ?? 1) as 0 | 1;
  const weekStart = toISODate(startOfWeek(fromISODate(today), { weekStartsOn }));
  const monthStart = toISODate(startOfMonth(fromISODate(today)));

  const dash = useDashboard();
  const { data: workspaces, isLoading: wsLoading } = useWorkspaces();
  const weekStats = useStats({ from: weekStart, to: today });
  const monthStats = useStats({ from: monthStart, to: today });
  const todayList = useList("activities", { from: today, to: today });
  const upcoming = useList("activities", { from: addDaysISO(today, 1), to: addDaysISO(today, 14), completed: "0" });
  const openCapture = useUi((s) => s.openCapture);

  const todayItems = useMemo(() => sortActivities(todayList.data ?? []), [todayList.data]);
  const todayDone = todayItems.filter((a) => a.completed).length;
  const name = me?.displayName?.split(" ")[0];
  const activeWorkspaces = (workspaces ?? []).filter((w) => !w.archivedAt);

  if (dash.error) {
    return (
      <Page>
        <ErrorState error={dash.error} onRetry={() => void dash.refetch()} />
      </Page>
    );
  }

  const isNewAccount = !wsLoading && activeWorkspaces.length === 0;

  return (
    <Page wide>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{format(fromISODate(today), "EEEE, MMMM d")}</p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
            {greeting()}
            {name ? `, ${name}` : ""}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={routes.planner()}>
              <CalendarCheck /> Planner
            </Link>
          </Button>
          <Button size="sm" onClick={() => openCapture("activity", { date: today })}>
            <Plus /> Plan activity
          </Button>
        </div>
      </header>

      {isNewAccount ? (
        <EmptyState
          className="mb-6"
          icon={Sparkles}
          title="Welcome to DevSpace"
          description="Create a workspace for each subject you're learning — DSA, LLD, FastAPI, System Design — then add notes, problems, resources and study sessions. This dashboard fills itself from what you record."
          action={
            <Button onClick={() => openCapture("workspace")}>
              <FolderPlus /> Create your first workspace
            </Button>
          }
        />
      ) : null}

      {/* Overview */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={CheckCircle2} label="Done today" value={todayList.isLoading ? "–" : todayDone} hint={todayList.isLoading ? undefined : `of ${todayItems.length} planned`} />
        <Stat icon={CalendarClock} label="Planned today" value={todayList.isLoading ? "–" : todayItems.length} hint={todayList.isLoading ? undefined : `${todayItems.length - todayDone} remaining`} />
        <Stat icon={Timer} label="This week" value={weekStats.data ? formatMinutes(weekStats.data.totals.actualMinutes) : "–"} hint={weekStats.data ? `${formatMinutes(weekStats.data.totals.plannedMinutes)} planned` : undefined} />
        <Stat icon={Timer} label="This month" value={monthStats.data ? formatMinutes(monthStats.data.totals.actualMinutes) : "–"} hint={monthStats.data ? `${monthStats.data.totals.completed} activities done` : undefined} />
        <Stat icon={Flame} label="Streak" value={monthStats.data ? `${monthStats.data.streak.current}d` : "–"} hint={monthStats.data ? `Longest ${monthStats.data.streak.longest}d` : undefined} />
        <Stat icon={CheckCircle2} label="Completed tasks" value={dash.data?.totalCompletedActivities ?? "–"} hint="all time" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Section
            title="Today's focus"
            action={
              <Link to={routes.planner()} className="text-xs text-muted-foreground hover:text-foreground">
                Open planner
              </Link>
            }
            bodyClassName="p-2"
          >
            <QuickAdd date={today} />
            {todayList.isLoading ? (
              <LoadingRows rows={3} className="p-2" />
            ) : todayItems.length ? (
              <div className="mt-1">
                {todayItems.map((a) => (
                  <ActivityItem key={a.id} activity={a} />
                ))}
              </div>
            ) : (
              <p className="px-2 py-4 text-sm text-muted-foreground">Nothing planned yet — add one thing you want to learn today.</p>
            )}
          </Section>

          <WorkspaceGrid summaries={dash.data?.workspaces} workspaces={activeWorkspaces} loading={dash.isLoading || wsLoading} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Recently edited notes" bodyClassName="p-1.5">
              <RecentNotes data={dash.data} />
            </Section>
            <Section
              title="Recently added resources"
              bodyClassName="p-1.5"
              action={
                <Link to={routes.resources()} className="text-xs text-muted-foreground hover:text-foreground">
                  Library
                </Link>
              }
            >
              <RecentResources data={dash.data} />
            </Section>
          </div>
        </div>

        <aside className="space-y-6">
          <ActivityMonth weekStartsOn={weekStartsOn} />

          <Section title="Upcoming" bodyClassName="p-1.5" action={<Link to={routes.calendar({ view: "week" })} className="text-xs text-muted-foreground hover:text-foreground">Calendar</Link>}>
            {upcoming.isLoading ? (
              <LoadingRows rows={2} className="p-2" />
            ) : upcoming.data?.length ? (
              sortActivities(upcoming.data)
                .slice(0, 6)
                .map((a) => <ActivityItem key={a.id} activity={a} showDate compact />)
            ) : (
              <p className="px-2 py-3 text-sm text-muted-foreground">Nothing scheduled for the next two weeks.</p>
            )}
          </Section>

          <Section title="Continue learning" bodyClassName="p-1.5">
            {dash.isLoading ? (
              <LoadingRows rows={3} className="p-2" />
            ) : dash.data?.continueLearning.length ? (
              <ul>
                {dash.data.continueLearning.map((c) => {
                  const Icon = CONTINUE_ICONS[c.type];
                  return (
                    <li key={`${c.type}-${c.id}`}>
                      <Link to={contentHref(c.type, c.id, c.workspaceId)} className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/60">
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{c.title || "Untitled"}</span>
                          <span className="text-2xs text-muted-foreground">
                            {CONTINUE_LABELS[c.type]} · {timeAgo(c.updatedAt)}
                          </span>
                        </span>
                        <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-2 py-3 text-sm text-muted-foreground">Items you're working on will show up here.</p>
            )}
          </Section>

          <Section
            title="Currently reading"
            bodyClassName="p-1.5"
            action={
              <Link to={routes.books()} className="text-xs text-muted-foreground hover:text-foreground">
                Bookshelf
              </Link>
            }
          >
            {dash.data?.readingBooks.length ? (
              <ul className="space-y-0.5">
                {dash.data.readingBooks.map((b) => {
                  const pct = b.totalPages ? Math.round((b.currentPage / b.totalPages) * 100) : 0;
                  return (
                    <li key={b.id}>
                      <Link to={routes.book(b.id)} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/60">
                        {b.coverUrl ? (
                          <img src={b.coverUrl} alt="" className="h-11 w-8 shrink-0 rounded-sm border object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-11 w-8 shrink-0 items-center justify-center rounded-sm border bg-muted">
                            <BookOpen className="size-3.5 text-muted-foreground" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="block truncate text-sm">{b.title}</span>
                          <Progress value={pct} className="h-1" aria-label={`${b.title} progress`} />
                          <span className="block text-2xs text-muted-foreground tabular">
                            {b.totalPages ? `p. ${b.currentPage} of ${b.totalPages} · ${pct}%` : `p. ${b.currentPage}`}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-2 py-3 text-sm text-muted-foreground">No book in progress.</p>
            )}
          </Section>
        </aside>
      </div>
    </Page>
  );
}

function QuickAdd({ date }: { date: string }) {
  const [title, setTitle] = useState("");
  const create = useCreate("activities");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (t) create.mutate({ title: t, date }, { onSuccess: () => setTitle("") });
  };
  return (
    <form onSubmit={submit} className="relative px-1 pt-1">
      <Plus className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task for today and press Enter"
        className="border-transparent bg-muted/50 pl-9 shadow-none"
        aria-label="Quick add a task for today"
        disabled={create.isPending}
      />
    </form>
  );
}

function ActivityMonth({ weekStartsOn }: { weekStartsOn: 0 | 1 }) {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => toISODate(startOfMonth(new Date())));
  const from = month;
  const to = toISODate(endOfMonth(fromISODate(month)));
  const { data } = useStats({ from, to });
  const wsMap = useWorkspaceMap();
  const isCurrent = month === toISODate(startOfMonth(new Date()));
  const shift = (n: number) => setMonth(toISODate(addMonths(fromISODate(month), n)));
  return (
    <Section
      title={format(fromISODate(month), "MMMM yyyy")}
      action={
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => shift(1)} disabled={isCurrent} aria-label="Next month">
            <ChevronRight />
          </Button>
        </div>
      }
    >
      {data ? (
        <>
          <MonthHeatmap month={month} days={data.days} workspaces={wsMap} weekStartsOn={weekStartsOn} onDayClick={(d) => navigate(routes.calendar({ view: "day", date: d }))} />
          <div className="mt-3 flex justify-between text-xs text-muted-foreground tabular">
            <span>{formatMinutes(data.totals.actualMinutes)} studied</span>
            <span>
              {data.totals.completed}/{data.totals.total} completed
            </span>
          </div>
        </>
      ) : (
        <Skeleton className="aspect-[7/6] w-full" />
      )}
    </Section>
  );
}

function WorkspaceGrid({
  summaries,
  workspaces,
  loading,
}: {
  summaries: DashboardResponse["workspaces"] | undefined;
  workspaces: Workspace[];
  loading: boolean;
}) {
  const openCapture = useUi((s) => s.openCapture);
  const byId = new Map((summaries ?? []).map((s) => [s.workspaceId, s]));
  if (loading) return <LoadingRows rows={2} />;
  if (!workspaces.length) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">Workspaces</h2>
        <Button variant="ghost" size="sm" onClick={() => openCapture("workspace")}>
          <Plus /> New
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {workspaces.map((w) => {
          const s = byId.get(w.id);
          const pct = s?.progress == null ? null : Math.round(s.progress * 100);
          return (
            <Link key={w.id} to={routes.workspace(w.id)} className="group rounded-lg border bg-card p-4 transition-colors hover:border-foreground/15">
              <div className="flex items-center gap-2.5">
                <WorkspaceIcon icon={w.icon} color={w.color} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{w.name}</span>
                <span className="text-xs text-muted-foreground tabular">{pct === null ? "" : `${pct}%`}</span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-label={pct === null ? "No progress yet" : `${pct}% progress`}>
                <div className="h-full rounded-full transition-[width]" style={{ width: `${pct ?? 0}%`, backgroundColor: w.color }} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-1 text-xs">
                <Metric label="Activities" value={s ? `${s.activitiesCompleted}/${s.activitiesTotal}` : "–"} />
                <Metric label="Time" value={s ? formatMinutes(s.minutes) : "–"} />
              </dl>
              <p className="mt-2 truncate text-2xs text-muted-foreground">
                {s?.lastActivityAt ? `Active ${timeAgo(s.lastActivityAt)}` : "No activity yet"}
                {s ? ` · ${summaryLine(s)}` : ""}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function summaryLine(s: DashboardResponse["workspaces"][number]): string {
  const parts: string[] = [];
  if (s.notes) parts.push(`${s.notes} notes`);
  if (s.dsaProblems) parts.push(`${s.dsaProblems} problems`);
  if (s.lldExercises) parts.push(`${s.lldExercises} LLD`);
  if (s.resources) parts.push(`${s.resources} resources`);
  if (s.snippets) parts.push(`${s.snippets} snippets`);
  return parts.slice(0, 3).join(" · ") || "Empty";
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular">{value}</dd>
    </div>
  );
}

function RecentNotes({ data }: { data: DashboardResponse | undefined }) {
  const wsMap = useWorkspaceMap();
  if (!data) return <LoadingRows rows={3} className="p-2" />;
  if (!data.recentNotes.length) return <p className="px-2 py-3 text-sm text-muted-foreground">No notes yet.</p>;
  return (
    <ul>
      {data.recentNotes.map((n) => {
        const ws = wsMap.get(n.workspaceId);
        return (
          <li key={n.id}>
            <Link to={routes.note(n.id)} className="block rounded-md px-2 py-1.5 hover:bg-accent/60">
              <span className="flex items-center gap-2">
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm">{n.title || "Untitled"}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 pl-5.5 text-2xs text-muted-foreground">
                {ws ? (
                  <>
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: ws.color }} />
                    {ws.name} ·
                  </>
                ) : null}
                {timeAgo(n.updatedAt)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function RecentResources({ data }: { data: DashboardResponse | undefined }) {
  const wsMap = useWorkspaceMap();
  if (!data) return <LoadingRows rows={3} className="p-2" />;
  if (!data.recentResources.length) return <p className="px-2 py-3 text-sm text-muted-foreground">No resources saved yet.</p>;
  return (
    <ul>
      {data.recentResources.map((r) => {
        const ws = r.workspaceId ? wsMap.get(r.workspaceId) : undefined;
        return (
          <li key={r.id} className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-accent/60">
            <Link to={routes.resources({ highlight: r.id })} className="min-w-0 flex-1">
              <span className="block truncate text-sm">{r.title}</span>
              <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                {RESOURCE_TYPE_LABELS[r.type]}
                {ws ? (
                  <>
                    {" · "}
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: ws.color }} />
                    {ws.name}
                  </>
                ) : null}
              </span>
            </Link>
            <a href={r.url} target="_blank" rel="noreferrer noopener" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Open ${r.title}`}>
              <ExternalLink className="size-3.5" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
