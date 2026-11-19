import { addDays, endOfWeek, format, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, ListTodo, Plus } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { dayTotals, formatMinutes, totalsByDate } from "@shared/time";
import { WorkspaceSelect } from "@/components/common/fields";
import { EmptyState, ErrorState, LoadingRows, Page, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatDay, fromISODate, relativeDay, toISODate, todayISO } from "@/lib/dates";
import { useCreate, useList, useMe } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { ActivityItem } from "./ActivityItem";
import { sortActivities } from "./lib";

function validDate(s: string | null): string | null {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export default function PlannerPage() {
  const [params, setParams] = useSearchParams();
  const date = validDate(params.get("date")) ?? todayISO();
  const setDate = (d: string) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (d === todayISO()) next.delete("date");
    else next.set("date", d);
    return next;
  });
  const shift = (n: number) => setDate(toISODate(addDays(fromISODate(date), n)));

  const weekStartsOn = useMe().data?.settings?.weekStartsOn ?? 1;
  const weekStart = toISODate(startOfWeek(fromISODate(date), { weekStartsOn }));
  const weekEnd = toISODate(endOfWeek(fromISODate(date), { weekStartsOn }));

  const { data: week, isLoading, error, refetch } = useList("activities", { from: weekStart, to: weekEnd });
  const openCapture = useUi((s) => s.openCapture);

  const dayItems = useMemo(() => sortActivities((week ?? []).filter((a) => a.date === date)), [week, date]);
  const totals = useMemo(() => dayTotals(dayItems), [dayItems]);
  const weekTotals = useMemo(() => totalsByDate(week ?? []), [week]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toISODate(addDays(fromISODate(weekStart), i))),
    [weekStart],
  );
  const pct = totals.total ? Math.round((totals.completed / totals.total) * 100) : 0;
  const isToday = date === todayISO();

  return (
    <Page>
      <PageHeader
        title="Daily planner"
        description={`${relativeDay(date)} · ${formatDay(date, "EEEE, MMMM d, yyyy")}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to={routes.calendar({ view: "week", date })}>
                <CalendarDays /> Calendar
              </Link>
            </Button>
            <Button size="sm" onClick={() => openCapture("activity", { date })}>
              <Plus /> Add activity
            </Button>
          </>
        }
      />

      {/* Day navigation + week strip */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-lg border bg-card shadow-xs">
          <Button variant="ghost" size="icon" className="size-8 rounded-r-none" onClick={() => shift(-1)} aria-label="Previous day">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 rounded-none border-x px-3 active:translate-y-0" onClick={() => setDate(todayISO())} disabled={isToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" className="size-8 rounded-l-none" onClick={() => shift(1)} aria-label="Next day">
            <ChevronRight />
          </Button>
        </div>
        <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 w-auto" aria-label="Pick a date" />
      </div>

      <div className="mb-6 grid grid-cols-7 gap-1.5 rounded-2xl border bg-card p-1.5 shadow-soft" role="tablist" aria-label="Week">
        {weekDays.map((d) => {
          const t = weekTotals.get(d);
          const ratio = t && t.total ? t.completed / t.total : 0;
          const selected = d === date;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setDate(d)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-xs transition-[background-color,color,box-shadow]",
                selected ? "bg-primary text-primary-foreground shadow-soft" : "hover:bg-accent",
              )}
            >
              <span className={cn("text-2xs font-medium tracking-wide uppercase", selected ? "text-primary-foreground/75" : "text-muted-foreground")}>
                {format(fromISODate(d), "EEE")}
              </span>
              <span className={cn("text-base font-semibold tabular", !selected && d === todayISO() && "text-brand")}>{format(fromISODate(d), "d")}</span>
              <span className={cn("h-1 w-8 overflow-hidden rounded-full", selected ? "bg-primary-foreground/25" : "bg-muted")} aria-hidden>
                <span className={cn("block h-full rounded-full", selected ? "bg-primary-foreground" : "bg-success")} style={{ width: `${ratio * 100}%` }} />
              </span>
              <span className={cn("text-2xs tabular", selected ? "text-primary-foreground/75" : "text-muted-foreground")}>{t?.total ? `${t.completed}/${t.total}` : "–"}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0 space-y-3">
          <QuickAdd date={date} />
          {isLoading ? (
            <LoadingRows rows={4} />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : dayItems.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title={isToday ? "Nothing planned for today" : `Nothing planned for ${relativeDay(date).toLowerCase()}`}
              description="Type a title above and press Enter, or add an activity with times and a linked problem, note or resource."
            />
          ) : (
            <div className="rounded-xl border bg-card shadow-soft p-1.5">
              {dayItems.map((a) => (
                <ActivityItem key={a.id} activity={a} />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border bg-card shadow-soft p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Completed</span>
              <span className="text-sm font-medium tabular">
                {totals.completed}/{totals.total}
              </span>
            </div>
            <Progress value={pct} className="mt-2 h-1.5" aria-label="Completion" />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Planned</dt>
                <dd className="font-medium tabular">{formatMinutes(totals.plannedMinutes)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Actual</dt>
                <dd className="font-medium tabular text-success">{formatMinutes(totals.actualMinutes)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-2xs leading-4 text-muted-foreground">
              Actual time counts completed sessions only; overlapping sessions are merged so no minute is counted twice.
            </p>
          </div>
        </aside>
      </div>
    </Page>
  );
}

function QuickAdd({ date }: { date: string }) {
  const [title, setTitle] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const create = useCreate("activities");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    create.mutate({ title: t, date, workspaceId }, { onSuccess: () => setTitle("") });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Plus className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Quick add — type a task and press Enter"
          className="pl-9"
          aria-label="Quick add activity"
          disabled={create.isPending}
        />
      </div>
      <WorkspaceSelect value={workspaceId} onChange={setWorkspaceId} allowNone className="sm:w-48" />
    </form>
  );
}
