import { format, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import { BookOpen, CheckCircle2, Clock, Flame, Info, Target, Timer, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BOOK_STATUS_LABELS,
  BOOK_STATUSES,
  DSA_DIFFICULTIES,
  DSA_DIFFICULTY_LABELS,
  DSA_STATUS_LABELS,
  DSA_STATUSES,
} from "@shared/constants";
import type { DayStat, StatsResponse } from "@shared/types";
import { addDaysISO, formatMinutes } from "@shared/time";
import { WorkspaceSelect } from "@/components/common/fields";
import { DSA_DIFFICULTY_TONE, DSA_STATUS_TONE, Pill, type Tone } from "@/components/common/Pill";
import { ErrorState, LoadingRows, Page, PageHeader, Section, Stat } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDay, fromISODate, toISODate, todayISO } from "@/lib/dates";
import { useMe, useStats, useWorkspaceMap, useWorkspaceSummaries } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { ACTUAL, AXIS, BarRow, ChartTooltip, GRID, hoursTick, LegendItem, PLANNED } from "./charts";
import { type HeatMetric, Heatmap } from "./Heatmap";

type Preset = "7d" | "30d" | "90d" | "month" | "year" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
];

function presetRange(p: Preset, today: string): { from: string; to: string } {
  const t = fromISODate(today);
  switch (p) {
    case "7d":
      return { from: addDaysISO(today, -6), to: today };
    case "30d":
      return { from: addDaysISO(today, -29), to: today };
    case "90d":
      return { from: addDaysISO(today, -89), to: today };
    case "month":
      return { from: toISODate(startOfMonth(t)), to: today };
    case "year":
      return { from: toISODate(startOfYear(t)), to: today };
    default:
      return { from: addDaysISO(today, -29), to: today };
  }
}

const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--muted-foreground)",
  brand: "var(--brand)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--destructive)",
  info: "var(--chart-5)",
  violet: "var(--chart-4)",
};

export default function AnalyticsPage() {
  const today = todayISO();
  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState(() => presetRange("30d", today));
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const range = preset === "custom" ? custom : presetRange(preset, today);
  const validRange = range.from <= range.to;
  const { data, isLoading, error, refetch, isFetching } = useStats({ ...(validRange ? range : presetRange("30d", today)), workspaceId: workspaceId ?? undefined });
  const weekStartsOn = (useMe().data?.settings?.weekStartsOn ?? 1) as 0 | 1;

  return (
    <Page wide>
      <PageHeader title="Analytics" description="Every number here is computed from your activities, problems and reading logs." />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" variant="outline" size="sm" value={preset} onValueChange={(v) => v && setPreset(v as Preset)} aria-label="Date range">
          {PRESETS.map((p) => (
            <ToggleGroupItem key={p.id} value={p.id} className="px-3">
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {preset === "custom" ? (
          <div className="flex items-center gap-1.5">
            <Input type="date" className="h-8 w-auto" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" />
            <span className="text-muted-foreground">–</span>
            <Input type="date" className="h-8 w-auto" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" />
          </div>
        ) : null}
        <WorkspaceSelect value={workspaceId} onChange={setWorkspaceId} allowNone noneLabel="All workspaces" className="h-8 w-48" />
        {isFetching && !isLoading ? <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-label="Updating" /> : null}
      </div>
      {!validRange ? <p className="mb-4 text-sm text-destructive">The start date must be before the end date.</p> : null}

      {isLoading ? (
        <LoadingRows rows={8} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data ? (
        <AnalyticsBody data={data} weekStartsOn={weekStartsOn} filteredWorkspace={workspaceId} />
      ) : null}
    </Page>
  );
}

function AnalyticsBody({ data, weekStartsOn, filteredWorkspace }: { data: StatsResponse; weekStartsOn: 0 | 1; filteredWorkspace: string | null }) {
  const wsMap = useWorkspaceMap();
  const [heatMetric, setHeatMetric] = useState<HeatMetric>("minutes");
  const dayCount = data.days.length;
  const activeDays = data.days.filter((d) => d.actualMinutes > 0).length;
  const completionRate = data.totals.total ? Math.round((data.totals.completed / data.totals.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Timer} label="Actual study time" value={formatMinutes(data.totals.actualMinutes)} hint={`${activeDays} active day${activeDays === 1 ? "" : "s"}`} />
        <Stat icon={Clock} label="Planned time" value={formatMinutes(data.totals.plannedMinutes)} hint={data.totals.plannedMinutes ? `${Math.round((data.totals.actualMinutes / data.totals.plannedMinutes) * 100)}% of plan realised` : "Nothing planned"} />
        <Stat icon={CheckCircle2} label="Completed activities" value={data.totals.completed} hint={`of ${data.totals.total} scheduled`} />
        <Stat icon={TrendingUp} label="Completion rate" value={`${completionRate}%`} />
        <Stat icon={Flame} label="Current streak" value={`${data.streak.current}d`} hint={`Longest ${data.streak.longest}d`} />
        <Stat icon={Target} label="Average / day" value={formatMinutes(dayCount ? data.totals.actualMinutes / dayCount : 0)} hint={`over ${dayCount} days`} />
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        Actual time counts completed activities only. Overlapping sessions on the same day are merged, so a minute is never counted twice; time
        shared between workspaces is split evenly. Planned time is what you scheduled.
      </p>

      <DailyChart days={data.days} />

      <div className="grid gap-6 lg:grid-cols-2">
        <PeriodTable days={data.days} weekStartsOn={weekStartsOn} />
        <Section title="Workspace time distribution">
          {data.byWorkspace.filter((w) => w.minutes > 0 || w.total > 0).length === 0 ? (
            <p className="text-sm text-muted-foreground">No activities in this range.</p>
          ) : (
            <div className="space-y-2.5">
              {(() => {
                const rows = data.byWorkspace.filter((w) => w.minutes > 0 || w.total > 0);
                const max = Math.max(...rows.map((r) => r.minutes));
                const total = rows.reduce((s, r) => s + r.minutes, 0);
                return rows.map((r) => {
                  const ws = wsMap.get(r.workspaceId);
                  return (
                    <BarRow
                      key={r.workspaceId}
                      label={ws?.name ?? "No workspace"}
                      icon={ws ? <WorkspaceIcon icon={ws.icon} color={ws.color} size="sm" /> : <span className="size-5 rounded bg-muted" />}
                      value={r.minutes}
                      max={max}
                      color={ws?.color ?? "var(--muted-foreground)"}
                      display={`${formatMinutes(r.minutes)}${total ? ` · ${Math.round((r.minutes / total) * 100)}%` : ""} · ${r.completed}/${r.total}`}
                    />
                  );
                });
              })()}
            </div>
          )}
        </Section>
      </div>

      <Section
        title="Activity heatmap"
        action={
          <ToggleGroup type="single" size="sm" variant="outline" value={heatMetric} onValueChange={(v) => v && setHeatMetric(v as HeatMetric)} aria-label="Heatmap metric">
            <ToggleGroupItem value="minutes" className="px-2.5 text-xs">Time</ToggleGroupItem>
            <ToggleGroupItem value="completed" className="px-2.5 text-xs">Completed</ToggleGroupItem>
          </ToggleGroup>
        }
      >
        <Heatmap days={data.days} metric={heatMetric} weekStartsOn={weekStartsOn} />
      </Section>

      {!filteredWorkspace ? <WorkspaceProgress /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <DsaStats data={data} />
        <ReadingStats data={data} />
      </div>
    </div>
  );
}

function DailyChart({ days }: { days: DayStat[] }) {
  const [showTable, setShowTable] = useState(false);
  // Long ranges are bucketed by week so bars stay legible.
  const weekly = days.length > 92;
  const rows = useMemo(() => {
    if (!weekly) return days.map((d) => ({ key: d.date, planned: d.plannedMinutes, actual: d.actualMinutes }));
    const out: { key: string; planned: number; actual: number }[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      out.push({
        key: chunk[0]!.date,
        planned: chunk.reduce((s, d) => s + d.plannedMinutes, 0),
        actual: chunk.reduce((s, d) => s + d.actualMinutes, 0),
      });
    }
    return out;
  }, [days, weekly]);
  const any = rows.some((r) => r.planned || r.actual);

  return (
    <Section
      title={weekly ? "Study time per week" : "Daily study time"}
      action={
        <div className="flex items-center gap-3">
          <LegendItem color={ACTUAL} label="Actual" />
          <LegendItem color={PLANNED} label="Planned" />
          <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setShowTable((s) => !s)}>
            {showTable ? "Show chart" : "Show table"}
          </button>
        </div>
      }
    >
      {!any ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No planned or recorded time in this range.</p>
      ) : showTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">{weekly ? "Week of" : "Date"}</th>
                <th className="py-1 text-right font-medium">Planned</th>
                <th className="py-1 text-right font-medium">Actual</th>
              </tr>
            </thead>
            <tbody>
              {rows.filter((r) => r.planned || r.actual).map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="py-1">{formatDay(r.key, "EEE, MMM d")}</td>
                  <td className="py-1 text-right tabular">{formatMinutes(r.planned)}</td>
                  <td className="py-1 text-right tabular">{formatMinutes(r.actual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} barGap={2} barCategoryGap={rows.length > 40 ? "10%" : "25%"} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="key"
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tickFormatter={(v: string) => format(fromISODate(v), rows.length > 31 ? "MMM d" : "d")}
              />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={hoursTick} width={44} />
              <Tooltip
                cursor={{ fill: "var(--accent)", opacity: 0.6 }}
                content={<ChartTooltip labelFormat={(l) => (weekly ? `Week of ${formatDay(l, "MMM d")}` : formatDay(l, "EEE, MMM d"))} />}
              />
              <Bar dataKey="planned" name="Planned" fill={PLANNED} radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="actual" name="Actual" fill={ACTUAL} radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  );
}

function PeriodTable({ days, weekStartsOn }: { days: DayStat[]; weekStartsOn: 0 | 1 }) {
  const [mode, setMode] = useState<"week" | "month">("week");
  const rows = useMemo(() => {
    const m = new Map<string, { planned: number; actual: number; completed: number; total: number }>();
    for (const d of days) {
      const key = mode === "week" ? toISODate(startOfWeek(fromISODate(d.date), { weekStartsOn })) : d.date.slice(0, 7);
      const cur = m.get(key) ?? { planned: 0, actual: 0, completed: 0, total: 0 };
      cur.planned += d.plannedMinutes;
      cur.actual += d.actualMinutes;
      cur.completed += d.completed;
      cur.total += d.total;
      m.set(key, cur);
    }
    return [...m.entries()].map(([key, v]) => ({ key, ...v })).reverse();
  }, [days, mode, weekStartsOn]);
  const max = Math.max(1, ...rows.map((r) => r.actual));
  return (
    <Section
      title={mode === "week" ? "Weekly study time" : "Monthly study time"}
      action={
        <ToggleGroup type="single" size="sm" variant="outline" value={mode} onValueChange={(v) => v && setMode(v as "week" | "month")} aria-label="Period">
          <ToggleGroupItem value="week" className="px-2.5 text-xs">Weekly</ToggleGroupItem>
          <ToggleGroupItem value="month" className="px-2.5 text-xs">Monthly</ToggleGroupItem>
        </ToggleGroup>
      }
      bodyClassName="max-h-80 overflow-auto"
    >
      <div className="space-y-2.5">
        {rows.map((r) => (
          <BarRow
            key={r.key}
            label={mode === "week" ? `Week of ${formatDay(r.key, "MMM d")}` : format(fromISODate(`${r.key}-01`), "MMMM yyyy")}
            value={r.actual}
            max={max}
            color={ACTUAL}
            display={`${formatMinutes(r.actual)} / ${formatMinutes(r.planned)} · ${r.completed}/${r.total}`}
          />
        ))}
      </div>
      <p className="mt-3 text-2xs text-muted-foreground">Actual / planned · completed / scheduled activities</p>
    </Section>
  );
}

function WorkspaceProgress() {
  const { data } = useWorkspaceSummaries();
  const wsMap = useWorkspaceMap();
  const rows = (data ?? []).filter((s) => {
    const ws = wsMap.get(s.workspaceId);
    return ws && !ws.archivedAt;
  });
  if (!rows.length) return null;
  return (
    <Section title="Workspace progress (all time)">
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        {rows.map((s) => {
          const ws = wsMap.get(s.workspaceId)!;
          const pct = s.progress === null ? null : Math.round(s.progress * 100);
          return (
            <div key={s.workspaceId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <WorkspaceIcon icon={ws.icon} color={ws.color} size="sm" />
                  <span className="truncate font-medium">{ws.name}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular">{pct === null ? "—" : `${pct}%`}</span>
              </div>
              <Progress value={pct ?? 0} className="h-1.5" aria-label={`${ws.name} progress`} />
              <div className="text-2xs text-muted-foreground tabular">
                {formatMinutes(s.minutes)} · {s.activitiesCompleted}/{s.activitiesTotal} activities
                {s.dsaProblems ? ` · ${s.dsaProblems} problems` : ""}
                {s.lldExercises ? ` · ${s.lldExercises} LLD` : ""}
                {s.resources ? ` · ${s.resources} resources` : ""}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-2xs text-muted-foreground">Progress = completed activities, resources, solved problems and LLD exercises ÷ all of them.</p>
    </Section>
  );
}

function DsaStats({ data }: { data: StatsResponse }) {
  const d = data.dsa;
  const diffMax = Math.max(1, ...DSA_DIFFICULTIES.map((k) => d.byDifficulty[k] ?? 0));
  const topicMax = Math.max(1, ...d.byTopic.map((t) => t.count));
  return (
    <Section title="DSA practice">
      {d.total === 0 ? (
        <p className="text-sm text-muted-foreground">No DSA problems tracked yet.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniKpi label="Solved" value={d.solved} hint={`of ${d.total}`} />
            <MiniKpi label="Solved in range" value={d.solvedInRange} />
            <MiniKpi label="Needs revision" value={d.needsRevision} />
            <MiniKpi label="Due for review" value={d.dueForReview} />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">By difficulty</h4>
            <div className="space-y-2">
              {DSA_DIFFICULTIES.map((k) => (
                <BarRow key={k} label={DSA_DIFFICULTY_LABELS[k]} value={d.byDifficulty[k] ?? 0} max={diffMax} color={TONE_COLOR[DSA_DIFFICULTY_TONE[k]]} display={String(d.byDifficulty[k] ?? 0)} />
              ))}
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">Status</h4>
            <div className="flex flex-wrap gap-1.5">
              {DSA_STATUSES.map((s) => (
                <Pill key={s} tone={DSA_STATUS_TONE[s]} dot>
                  {DSA_STATUS_LABELS[s]} · {d.byStatus[s] ?? 0}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">By topic (solved / total)</h4>
            <div className="max-h-56 space-y-2 overflow-auto pr-1">
              {d.byTopic.map((t) => (
                <BarRow key={t.topic} label={t.topic} value={t.count} max={topicMax} color="var(--chart-2)" display={`${t.solved}/${t.count}`} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

function ReadingStats({ data }: { data: StatsResponse }) {
  const r = data.reading;
  const rows = data.days.map((d) => ({ key: d.date, pages: r.pagesPerDay[d.date] ?? 0 }));
  const totalBooks = BOOK_STATUSES.reduce((s, k) => s + (r.byStatus[k] ?? 0), 0);
  return (
    <Section title="Reading">
      {totalBooks === 0 ? (
        <p className="text-sm text-muted-foreground">No books on your shelf yet.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <MiniKpi label="Pages read" value={r.pagesInRange} />
            <MiniKpi label="Books finished" value={r.completedInRange} />
            <MiniKpi label="Reading now" value={r.byStatus.reading ?? 0} />
          </div>
          {r.pagesInRange > 0 ? (
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="key" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(v: string) => format(fromISODate(v), "MMM d")} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.6 }}
                    content={<ChartTooltip labelFormat={(l) => formatDay(l, "EEE, MMM d")} valueFormat={(v) => `${v} pages`} />}
                  />
                  <Bar dataKey="pages" name="Pages" fill="var(--chart-3)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No reading progress logged in this range.</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {BOOK_STATUSES.map((s) => (
              <span key={s} className={cn("inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground")}>
                <BookOpen className="size-3" />
                {BOOK_STATUS_LABELS[s]} · {r.byStatus[s] ?? 0}
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function MiniKpi({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular">
        {value}
        {hint ? <span className="ml-1 text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  );
}

