import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Check, ChevronLeft, ChevronRight, Clock, ExternalLink, Pencil, Plus, Timer } from "lucide-react";
import { type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { ActivityWithLink, Workspace } from "@shared/types";
import { dayTotals, formatMinutes, formatTime12, intervalMinutes, timeToMinutes, totalsByDate } from "@shared/time";
import { WorkspaceSelect } from "@/components/common/fields";
import { ErrorState, Page } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDay, fromISODate, relativeDay, toISODate, todayISO } from "@/lib/dates";
import { useList, useMe, useWorkspaceMap } from "@/lib/queries";
import { contentHref } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { ActivityDialog } from "../planner/ActivityDialog";
import { ActivityItem, CompleteToggle, useToggleActivity } from "../planner/ActivityItem";
import { linkMeta, sortActivities, timeLabel } from "../planner/lib";
import { QuickAdd } from "../planner/QuickAdd";

type View = "month" | "week" | "day";
const HOUR_PX = 44;
const NEUTRAL = "#8b8b94";

function useWsColor() {
  const map = useWorkspaceMap();
  return (a: ActivityWithLink): { color: string; ws?: Workspace } => {
    const ws = a.workspaceId ? map.get(a.workspaceId) : undefined;
    return { color: ws?.color ?? NEUTRAL, ws };
  };
}

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const view: View = (["month", "week", "day"] as const).find((v) => v === params.get("view")) ?? "month";
  const rawDate = params.get("date");
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayISO();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const weekStartsOn = (useMe().data?.settings?.weekStartsOn ?? 1) as 0 | 1;

  const update = (next: { view?: View; date?: string }) =>
    setParams((p) => {
      const sp = new URLSearchParams(p);
      if (next.view) sp.set("view", next.view);
      if (next.date) sp.set("date", next.date);
      return sp;
    });

  const anchor = fromISODate(date);
  const range = useMemo(() => {
    if (view === "month") {
      return {
        from: toISODate(startOfWeek(startOfMonth(anchor), { weekStartsOn })),
        to: toISODate(endOfWeek(endOfMonth(anchor), { weekStartsOn })),
      };
    }
    if (view === "week") {
      return { from: toISODate(startOfWeek(anchor, { weekStartsOn })), to: toISODate(endOfWeek(anchor, { weekStartsOn })) };
    }
    return { from: date, to: date };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date, weekStartsOn]);

  const { data, error, refetch, isFetching } = useList("activities", { ...range, workspaceId: workspaceId ?? undefined });
  const activities = useMemo(() => sortActivities(data ?? []), [data]);
  const byDate = useMemo(() => {
    const m = new Map<string, ActivityWithLink[]>();
    for (const a of activities) {
      const l = m.get(a.date);
      if (l) l.push(a);
      else m.set(a.date, [a]);
    }
    return m;
  }, [activities]);

  const step = (dir: 1 | -1) => {
    const d = view === "month" ? addMonths(anchor, dir) : view === "week" ? addWeeks(anchor, dir) : addDays(anchor, dir);
    update({ date: toISODate(d) });
  };

  const title =
    view === "month"
      ? format(anchor, "MMMM yyyy")
      : view === "week"
        ? `${formatDay(range.from, "MMM d")} – ${formatDay(range.to, range.from.slice(0, 7) === range.to.slice(0, 7) ? "d, yyyy" : "MMM d, yyyy")}`
        : formatDay(date, "EEEE, MMMM d, yyyy");

  return (
    <Page wide className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {isFetching ? <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-label="Loading" /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WorkspaceSelect value={workspaceId} onChange={setWorkspaceId} allowNone noneLabel="All workspaces" className="h-8 w-44" />
          <div className="flex items-center overflow-hidden rounded-lg border bg-card shadow-xs">
            <Button variant="ghost" size="icon" className="size-8 rounded-r-none" onClick={() => step(-1)} aria-label="Previous">
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 rounded-none border-x px-3" onClick={() => update({ date: todayISO() })}>
              Today
            </Button>
            <Button variant="ghost" size="icon" className="size-8 rounded-l-none" onClick={() => step(1)} aria-label="Next">
              <ChevronRight />
            </Button>
          </div>
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && update({ view: v as View })}
            variant="outline"
            size="sm"
            aria-label="Calendar view"
          >
            <ToggleGroupItem value="month" className="px-3">Month</ToggleGroupItem>
            <ToggleGroupItem value="week" className="px-3">Week</ToggleGroupItem>
            <ToggleGroupItem value="day" className="px-3">Day</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : view === "month" ? (
        <MonthView anchor={anchor} range={range} byDate={byDate} weekStartsOn={weekStartsOn} onOpenDay={(d) => update({ view: "day", date: d })} />
      ) : view === "week" ? (
        <TimeGrid days={eachDay(range.from, range.to)} byDate={byDate} onOpenDay={(d) => update({ view: "day", date: d })} />
      ) : (
        <DayView date={date} items={byDate.get(date) ?? []} />
      )}
    </Page>
  );
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = fromISODate(from); toISODate(d) <= to; d = addDays(d, 1)) out.push(toISODate(d));
  return out;
}

// ---------------------------------------------------------------------------
// Month
// ---------------------------------------------------------------------------

function MonthView({
  anchor,
  range,
  byDate,
  weekStartsOn,
  onOpenDay,
}: {
  anchor: Date;
  range: { from: string; to: string };
  byDate: Map<string, ActivityWithLink[]>;
  weekStartsOn: 0 | 1;
  onOpenDay: (d: string) => void;
}) {
  const openCapture = useUi((s) => s.openCapture);
  const days = eachDay(range.from, range.to);
  const today = todayISO();
  const totals = useMemo(() => totalsByDate([...byDate.values()].flat()), [byDate]);
  const headers = Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(new Date(), { weekStartsOn }), i), "EEE"));
  const MAX = 3;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-xs text-muted-foreground">
        {headers.map((h) => (
          <div key={h} className="px-2 py-1.5">
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" style={{ gridAutoRows: "minmax(112px, 1fr)" }}>
        {days.map((d, i) => {
          const items = byDate.get(d) ?? [];
          const t = totals.get(d);
          const inMonth = isSameMonth(fromISODate(d), anchor);
          return (
            <div
              key={d}
              className={cn(
                "group relative flex min-w-0 flex-col gap-0.5 border-border p-1.5",
                i % 7 !== 6 && "border-r",
                i < days.length - 7 && "border-b",
                !inMonth && "bg-muted/30",
              )}
              onClick={(e) => {
                if (e.target === e.currentTarget) openCapture("activity", { date: d });
              }}
            >
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => onOpenDay(d)}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs tabular hover:bg-accent",
                    d === today ? "bg-brand font-semibold text-brand-foreground hover:bg-brand" : inMonth ? "" : "text-muted-foreground",
                  )}
                  aria-label={`Open ${formatDay(d, "EEEE, MMMM d")}`}
                >
                  {format(fromISODate(d), "d")}
                </button>
                <div className="flex items-center gap-1">
                  {t && t.actualMinutes > 0 ? (
                    <span className="text-2xs text-muted-foreground tabular" title="Actual study time">
                      {formatMinutes(t.actualMinutes)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openCapture("activity", { date: d })}
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                    aria-label={`Add activity on ${formatDay(d, "MMMM d")}`}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
              {items.slice(0, MAX).map((a) => (
                <ActivityChip key={a.id} activity={a} />
              ))}
              {items.length > MAX ? (
                <button type="button" onClick={() => onOpenDay(d)} className="px-1 text-left text-2xs text-muted-foreground hover:text-foreground">
                  +{items.length - MAX} more
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityChip({ activity }: { activity: ActivityWithLink }) {
  const colorOf = useWsColor();
  const { color } = colorOf(activity);
  const { isCompleted } = useToggleActivity();
  const done = isCompleted(activity);
  return (
    <ActivityPopover activity={activity}>
      <button
        type="button"
        className={cn(
          "flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-2xs hover:bg-accent",
          done && "text-muted-foreground",
        )}
      >
        {done ? (
          <Check className="size-3 shrink-0 text-success" strokeWidth={3} aria-label="Completed" />
        ) : (
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        )}
        {activity.startTime ? <span className="shrink-0 tabular text-muted-foreground">{formatTime12(activity.startTime)}</span> : null}
        <span className={cn("truncate", done && "line-through decoration-muted-foreground/50")}>{activity.title}</span>
      </button>
    </ActivityPopover>
  );
}

// ---------------------------------------------------------------------------
// Activity details popover
// ---------------------------------------------------------------------------

function ActivityPopover({ activity, children }: { activity: ActivityWithLink; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const colorOf = useWsColor();
  const { color, ws } = colorOf(activity);
  const { toggle, isCompleted } = useToggleActivity();
  const done = isCompleted(activity);
  const link = activity.link;
  const LinkIcon = link ? linkMeta(link.type).icon : null;
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild onClick={(e: MouseEvent) => e.stopPropagation()}>
          {children}
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-3 p-4">
            <div className="flex items-start gap-2.5">
              <div className="pt-0.5">
                <CompleteToggle completed={done} onToggle={() => toggle(activity)} label={activity.title} />
              </div>
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>{activity.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {relativeDay(activity.date)}
                  {timeLabel(activity) ? ` · ${timeLabel(activity)}` : ""}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-[88px_1fr] gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Workspace</dt>
              <dd className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                {ws?.name ?? "None"}
              </dd>
              <dt className="text-muted-foreground">Planned</dt>
              <dd className="tabular">{activity.plannedMinutes ? formatMinutes(activity.plannedMinutes) : "—"}</dd>
              <dt className="text-muted-foreground">Recorded</dt>
              <dd className="tabular">{activity.actualMinutes ? formatMinutes(activity.actualMinutes) : "—"}</dd>
            </dl>
            {activity.description ? <p className="text-xs whitespace-pre-wrap text-muted-foreground">{activity.description}</p> : null}
            {link && LinkIcon ? (
              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <Link to={contentHref(link.type, link.id)} onClick={() => setOpen(false)}>
                  <LinkIcon /> <span className="truncate">Open {link.title}</span>
                </Link>
              </Button>
            ) : null}
            {link?.type === "resource" && link.url ? (
              <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
                <a href={link.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink /> Open link in new tab
                </a>
              </Button>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t px-4 py-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setEditing(true);
              }}
            >
              <Pencil /> Edit
            </Button>
            <Button size="sm" variant={done ? "outline" : "default"} onClick={() => toggle(activity)}>
              <Check /> {done ? "Mark incomplete" : "Mark complete"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <ActivityDialog open={editing} onOpenChange={setEditing} activity={activity} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Week / Day time grid
// ---------------------------------------------------------------------------

interface Placed {
  a: ActivityWithLink;
  top: number;
  height: number;
  col: number;
  cols: number;
}

/** Lay out timed activities of one day into side-by-side columns when they overlap. */
function layoutDay(items: ActivityWithLink[]): Placed[] {
  const timed = items
    .filter((a) => a.startTime)
    .map((a) => {
      const start = timeToMinutes(a.startTime!);
      const dur = intervalMinutes(a.startTime, a.endTime) ?? (a.plannedMinutes || 30);
      return { a, start, end: Math.min(start + Math.max(dur, 15), 24 * 60) };
    })
    .sort((x, y) => x.start - y.start || y.end - x.end);
  const out: Placed[] = [];
  let cluster: { a: ActivityWithLink; start: number; end: number; col: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) out.push({ a: c.a, top: (c.start / 60) * HOUR_PX, height: ((c.end - c.start) / 60) * HOUR_PX, col: c.col, cols });
    cluster = [];
  };
  for (const t of timed) {
    if (t.start >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.end > t.start).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...t, col });
    clusterEnd = Math.max(clusterEnd, t.end);
  }
  if (cluster.length) flush();
  return out;
}

function TimeGrid({
  days,
  byDate,
  onOpenDay,
}: {
  days: string[];
  byDate: Map<string, ActivityWithLink[]>;
  onOpenDay?: (d: string) => void;
}) {
  const openCapture = useUi((s) => s.openCapture);
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = todayISO();
  const colorOf = useWsColor();
  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());

  useEffect(() => {
    const t = setInterval(() => setNowMin(new Date().getHours() * 60 + new Date().getMinutes()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Open the grid on the day's first timed activity (or 7 AM), so nothing hides below the fold.
  const firstStart = useMemo(() => {
    let min = Infinity;
    for (const d of days) for (const a of byDate.get(d) ?? []) if (a.startTime) min = Math.min(min, timeToMinutes(a.startTime));
    return min;
  }, [days, byDate]);
  const targetMin = Number.isFinite(firstStart) ? Math.max(0, Math.min(7 * 60, firstStart - 30)) : 7 * 60;
  const daysKey = days.join(",");
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = (targetMin / 60) * HOUR_PX;
  }, [daysKey, targetMin]);

  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-soft">
      {/* Header */}
      <div className="grid overflow-y-hidden border-b bg-muted/40 [scrollbar-gutter:stable]" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const t = dayTotals(byDate.get(d) ?? []);
          return (
            <div key={d} className="border-l px-2 py-1.5">
              <button type="button" onClick={() => onOpenDay?.(d)} className="flex items-baseline gap-1.5 text-left" disabled={!onOpenDay}>
                <span className="text-xs text-muted-foreground">{format(fromISODate(d), "EEE")}</span>
                <span className={cn("text-sm font-medium tabular", d === today && "text-brand")}>{format(fromISODate(d), "d")}</span>
              </button>
              <div className="text-2xs text-muted-foreground tabular">
                {t.total ? `${t.completed}/${t.total} done` : " "}
                {t.actualMinutes ? ` · ${formatMinutes(t.actualMinutes)}` : ""}
              </div>
            </div>
          );
        })}
      </div>
      {/* All-day (untimed) */}
      <div className="grid overflow-y-hidden border-b [scrollbar-gutter:stable]" style={{ gridTemplateColumns: cols }}>
        <div className="px-1.5 py-1 text-right text-2xs text-muted-foreground">All day</div>
        {days.map((d) => (
          <div
            key={d}
            className="min-h-8 space-y-0.5 border-l p-1"
            onClick={(e) => {
              if (e.target === e.currentTarget) openCapture("activity", { date: d });
            }}
          >
            {(byDate.get(d) ?? [])
              .filter((a) => !a.startTime)
              .map((a) => (
                <ActivityChip key={a.id} activity={a} />
              ))}
          </div>
        ))}
      </div>
      {/* Hours */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute right-1.5 -translate-y-1/2 text-2xs text-muted-foreground tabular" style={{ top: h * HOUR_PX }}>
                {h === 0 ? "" : formatTime12(`${h}:00`)}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const placed = layoutDay(byDate.get(d) ?? []);
            return (
              <div key={d} className="relative border-l">
                {Array.from({ length: 24 }, (_, h) => (
                  <button
                    key={h}
                    type="button"
                    tabIndex={-1}
                    aria-label={`Add activity ${formatDay(d, "MMM d")} at ${h}:00`}
                    onClick={() => openCapture("activity", { date: d, startTime: `${String(h).padStart(2, "0")}:00` })}
                    className="absolute inset-x-0 border-t border-border/60 hover:bg-accent/40"
                    style={{ top: h * HOUR_PX, height: HOUR_PX }}
                  />
                ))}
                {d === today ? (
                  <div className="pointer-events-none absolute inset-x-0 z-10 h-px bg-brand" style={{ top: (nowMin / 60) * HOUR_PX }}>
                    <span className="absolute -top-[3px] -left-[3px] size-[7px] rounded-full bg-brand" />
                  </div>
                ) : null}
                {placed.map((p) => {
                  const { color } = colorOf(p.a);
                  return (
                    <ActivityPopover key={p.a.id} activity={p.a}>
                      <button
                        type="button"
                        className={cn(
                          "absolute z-[5] overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-2xs leading-4 transition-colors",
                          p.a.completed ? "opacity-70" : "",
                        )}
                        style={{
                          top: p.top + 1,
                          height: Math.max(p.height - 2, 18),
                          left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                          width: `calc(${100 / p.cols}% - 4px)`,
                          borderLeftColor: color,
                          backgroundColor: `${color}1f`,
                        }}
                      >
                        <span className={cn("flex items-center gap-1 font-medium", p.a.completed && "line-through")}>
                          {p.a.completed ? <Check className="size-3 shrink-0 text-success" strokeWidth={3} /> : null}
                          <span className="truncate">{p.a.title}</span>
                        </span>
                        {p.height > 30 ? <span className="block truncate text-muted-foreground tabular">{timeLabel(p.a)}</span> : null}
                      </button>
                    </ActivityPopover>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayView({ date, items }: { date: string; items: ActivityWithLink[] }) {
  const openCapture = useUi((s) => s.openCapture);
  const t = dayTotals(items);
  return (
    <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_380px]">
      <TimeGrid days={[date]} byDate={new Map([[date, items]])} />
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Done" value={`${t.completed}/${t.total}`} />
          <MiniStat label="Planned" value={formatMinutes(t.plannedMinutes)} icon={<Clock className="size-3" />} />
          <MiniStat label="Actual" value={formatMinutes(t.actualMinutes)} icon={<Timer className="size-3" />} />
        </div>
        <QuickAdd key={date} date={date} />
        <div className="rounded-xl border bg-card shadow-soft p-1.5">
          {items.length ? (
            items.map((a) => <ActivityItem key={a.id} activity={a} />)
          ) : (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
          )}
        </div>
        <Button size="sm" variant="outline" className="w-full" onClick={() => openCapture("activity", { date })}>
          <Plus /> Add with times, links & notes
        </Button>
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card shadow-soft px-3 py-2">
      <div className="flex items-center gap-1 text-2xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium tabular">{value}</div>
    </div>
  );
}
