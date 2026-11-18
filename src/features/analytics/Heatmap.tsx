import { addDays, format, startOfMonth, startOfWeek } from "date-fns";
import { useMemo, useState } from "react";
import type { DayStat, Workspace } from "@shared/types";
import { formatMinutes } from "@shared/time";
import { formatDay, fromISODate, toISODate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type HeatMetric = "minutes" | "completed";

function valueOf(d: DayStat, metric: HeatMetric) {
  return metric === "minutes" ? d.actualMinutes : d.completed;
}

/** Map a value to heat level 0–4 relative to the max in view. */
function levelFor(v: number, max: number): number {
  if (v <= 0 || max <= 0) return 0;
  const r = v / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

const HEAT = ["var(--heat-0)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"];

function describe(d: DayStat) {
  return `${formatDay(d.date, "EEE, MMM d, yyyy")}: ${formatMinutes(d.actualMinutes)} studied, ${d.completed}/${d.total} activities completed`;
}

function Tip({ day, x, y }: { day: DayStat; x: number; y: number }) {
  return (
    <div
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
      style={{ left: x, top: y - 8 }}
      role="tooltip"
    >
      <div className="font-medium">{formatDay(day.date, "EEE, MMM d, yyyy")}</div>
      <div className="text-muted-foreground tabular">
        {formatMinutes(day.actualMinutes)} studied · {day.completed}/{day.total} done
      </div>
      {day.plannedMinutes ? <div className="text-muted-foreground tabular">{formatMinutes(day.plannedMinutes)} planned</div> : null}
    </div>
  );
}

function useTip() {
  const [tip, setTip] = useState<{ day: DayStat; x: number; y: number } | null>(null);
  const show = (day: DayStat, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ day, x: r.left + r.width / 2, y: r.top });
  };
  return { tip, show, hide: () => setTip(null) };
}

export function HeatLegend({ metric }: { metric: HeatMetric }) {
  return (
    <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
      <span>Less</span>
      {HEAT.map((c, i) => (
        <span key={i} className="size-2.5 rounded-[3px]" style={{ backgroundColor: c }} />
      ))}
      <span>More</span>
      <span className="ml-1">({metric === "minutes" ? "study time" : "completed activities"})</span>
    </div>
  );
}

/**
 * Range heatmap: one column per week, one row per weekday.
 * Keyboard accessible (each cell is a focusable button with a full description).
 */
export function Heatmap({
  days,
  metric,
  colorFor,
  weekStartsOn = 1,
  onDayClick,
}: {
  days: DayStat[];
  metric: HeatMetric;
  colorFor?: (day: DayStat, level: number) => string | undefined;
  weekStartsOn?: 0 | 1;
  onDayClick?: (date: string) => void;
}) {
  const { tip, show, hide } = useTip();
  const { weeks, max } = useMemo(() => {
    if (!days.length) return { weeks: [] as (DayStat | null)[][], max: 0 };
    const max = Math.max(...days.map((d) => valueOf(d, metric)));
    const first = fromISODate(days[0]!.date);
    const lead = (first.getDay() - weekStartsOn + 7) % 7;
    const cells: (DayStat | null)[] = [...Array<null>(lead).fill(null), ...days];
    const weeks: (DayStat | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { weeks, max };
  }, [days, metric, weekStartsOn]);

  const labels = Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(new Date(), { weekStartsOn }), i), "EEEEE"));

  if (!days.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="grid shrink-0 grid-rows-7 gap-[3px] pt-4 text-2xs text-muted-foreground">
          {labels.map((l, i) => (
            <span key={i} className="flex h-3 items-center leading-none">
              {i % 2 === 0 ? l : ""}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => {
            const firstReal = week.find(Boolean);
            const showMonth = firstReal && (wi === 0 || fromISODate(firstReal.date).getDate() <= 7);
            return (
              <div key={wi} className="flex flex-col gap-[3px]">
                <span className="h-4 text-2xs leading-4 whitespace-nowrap text-muted-foreground">
                  {showMonth && firstReal ? format(fromISODate(firstReal.date), "MMM") : ""}
                </span>
                {Array.from({ length: 7 }, (_, di) => {
                  const d = week[di];
                  if (!d) return <span key={di} className="size-3" />;
                  const level = levelFor(valueOf(d, metric), max);
                  return (
                    <button
                      key={di}
                      type="button"
                      aria-label={describe(d)}
                      onMouseEnter={(e) => show(d, e.currentTarget)}
                      onMouseLeave={hide}
                      onFocus={(e) => show(d, e.currentTarget)}
                      onBlur={hide}
                      onClick={() => onDayClick?.(d.date)}
                      className={cn("size-3 rounded-[3px] outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring", d.date === todayISO() && "ring-1 ring-foreground/40")}
                      style={{ backgroundColor: colorFor?.(d, level) ?? HEAT[level] }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <HeatLegend metric={metric} />
      {tip ? <Tip {...tip} /> : null}
    </div>
  );
}

/**
 * Single-month calendar heatmap with workspace-coloured dots for the
 * workspaces you recorded time in that day.
 */
export function MonthHeatmap({
  month,
  days,
  metric = "minutes",
  workspaces,
  weekStartsOn = 1,
  onDayClick,
}: {
  /** Any date inside the month (YYYY-MM-DD). */
  month: string;
  days: DayStat[];
  metric?: HeatMetric;
  workspaces?: Map<string, Workspace>;
  weekStartsOn?: 0 | 1;
  onDayClick?: (date: string) => void;
}) {
  const { tip, show, hide } = useTip();
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const monthStart = startOfMonth(fromISODate(month));
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const cells = Array.from({ length: 42 }, (_, i) => toISODate(addDays(gridStart, i)));
  const monthKey = toISODate(monthStart).slice(0, 7);
  const rows = cells.slice(35).some((c) => c.startsWith(monthKey)) ? 6 : 5;
  const inMonth = days.filter((d) => d.date.startsWith(monthKey));
  const max = Math.max(0, ...inMonth.map((d) => valueOf(d, metric)));
  const labels = Array.from({ length: 7 }, (_, i) => format(addDays(gridStart, i), "EEEEEE"));
  const today = todayISO();

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-2xs text-muted-foreground">
        {labels.map((l) => (
          <span key={l} className="pb-1">
            {l}
          </span>
        ))}
        {cells.slice(0, rows * 7).map((date) => {
          const d = byDate.get(date);
          const current = date.startsWith(monthKey);
          if (!current) return <span key={date} className="aspect-square" />;
          const stat: DayStat = d ?? { date, plannedMinutes: 0, actualMinutes: 0, completed: 0, total: 0, byWorkspace: {} };
          const level = levelFor(valueOf(stat, metric), max);
          const wsDots = Object.entries(stat.byWorkspace)
            .filter(([, m]) => m > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
          return (
            <button
              key={date}
              type="button"
              aria-label={describe(stat)}
              onMouseEnter={(e) => show(stat, e.currentTarget)}
              onMouseLeave={hide}
              onFocus={(e) => show(stat, e.currentTarget)}
              onBlur={hide}
              onClick={() => onDayClick?.(date)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-md text-xs tabular transition-shadow hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                level >= 3 ? "text-brand-foreground" : "text-foreground",
                date === today && "ring-1 ring-foreground/50",
              )}
              style={{ backgroundColor: HEAT[level] }}
            >
              <span>{Number(date.slice(8))}</span>
              {wsDots.length ? (
                <span className="absolute bottom-1 flex gap-0.5">
                  {wsDots.map(([id]) => (
                    <span
                      key={id}
                      className="size-1 rounded-full ring-1 ring-background/60"
                      style={{ backgroundColor: workspaces?.get(id)?.color ?? "#8b8b94" }}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-3">
        <HeatLegend metric={metric} />
      </div>
      {tip ? <Tip {...tip} /> : null}
    </div>
  );
}
