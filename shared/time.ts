// Overlap-safe study-time accounting shared by the server (analytics) and UI.
//
// Rules:
// - Planned time: timed activities contribute their [start, end) interval; untimed
//   activities contribute plannedMinutes. Overlapping planned intervals count once.
// - Actual time: only *completed* activities count. A timed activity's actual
//   session is [start, start + actualMinutes); overlapping sessions on the same day
//   are merged so the same minute is never counted twice. Untimed activities add
//   their actualMinutes directly (there is no clock position to overlap with).
// - When sessions overlap across workspaces, each shared minute is split evenly
//   between the overlapping workspaces, so per-workspace totals sum to the day total.

export interface TimeActivity {
  workspaceId: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  plannedMinutes: number;
  actualMinutes: number;
  completed: boolean;
}

export function timeToMinutes(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Interval length in minutes, or null if times are missing/invalid. */
export function intervalMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const d = timeToMinutes(end) - timeToMinutes(start);
  return d > 0 ? d : null;
}

interface Interval {
  start: number;
  end: number;
  key: string;
}

/** Sweep-line: total covered length + per-key share of every covered segment. */
export function sweep(intervals: Interval[]): { total: number; byKey: Record<string, number> } {
  const byKey: Record<string, number> = {};
  if (intervals.length === 0) return { total: 0, byKey };
  const points = [...new Set(intervals.flatMap((i) => [i.start, i.end]))].sort((a, b) => a - b);
  let total = 0;
  for (let p = 0; p < points.length - 1; p++) {
    const a = points[p]!;
    const b = points[p + 1]!;
    const active = intervals.filter((i) => i.start <= a && i.end >= b);
    if (active.length === 0) continue;
    const len = b - a;
    total += len;
    for (const i of active) byKey[i.key] = (byKey[i.key] ?? 0) + len / active.length;
  }
  return { total, byKey };
}

export interface DayTotals {
  plannedMinutes: number;
  actualMinutes: number;
  completed: number;
  total: number;
  byWorkspace: Record<string, number>;
}

/** Compute totals for activities that all share one date. */
export function dayTotals(items: TimeActivity[]): DayTotals {
  const plannedIntervals: Interval[] = [];
  const actualIntervals: Interval[] = [];
  let plannedLoose = 0;
  let actualLoose = 0;
  const byWorkspace: Record<string, number> = {};
  let completed = 0;

  for (const a of items) {
    const key = a.workspaceId ?? "none";
    const start = a.startTime ? timeToMinutes(a.startTime) : null;
    const span = intervalMinutes(a.startTime, a.endTime);
    if (start !== null && span !== null) plannedIntervals.push({ start, end: start + span, key });
    else plannedLoose += a.plannedMinutes;

    if (!a.completed) continue;
    completed++;
    if (a.actualMinutes <= 0) continue;
    if (start !== null) {
      actualIntervals.push({ start, end: Math.min(start + a.actualMinutes, 24 * 60), key });
    } else {
      actualLoose += a.actualMinutes;
      byWorkspace[key] = (byWorkspace[key] ?? 0) + a.actualMinutes;
    }
  }

  const planned = sweep(plannedIntervals);
  const actual = sweep(actualIntervals);
  for (const [k, v] of Object.entries(actual.byKey)) byWorkspace[k] = (byWorkspace[k] ?? 0) + v;
  for (const k of Object.keys(byWorkspace)) byWorkspace[k] = Math.round(byWorkspace[k]! * 10) / 10;

  return {
    plannedMinutes: Math.round(planned.total + plannedLoose),
    actualMinutes: Math.round(actual.total + actualLoose),
    completed,
    total: items.length,
    byWorkspace,
  };
}

/** Group by date and compute per-day totals. */
export function totalsByDate(items: TimeActivity[]): Map<string, DayTotals> {
  const groups = new Map<string, TimeActivity[]>();
  for (const a of items) {
    const list = groups.get(a.date);
    if (list) list.push(a);
    else groups.set(a.date, [a]);
  }
  const out = new Map<string, DayTotals>();
  for (const [date, list] of groups) out.set(date, dayTotals(list));
  return out;
}

/** Add days to a YYYY-MM-DD string (calendar arithmetic, timezone-free). */
export function addDaysISO(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Streaks over dates with at least one completed activity.
 * The current streak may end today or yesterday (today isn't over yet).
 */
export function computeStreaks(activeDates: Iterable<string>, today: string): { current: number; longest: number } {
  const set = new Set(activeDates);
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && addDaysISO(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let cursor = set.has(today) ? today : addDaysISO(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDaysISO(cursor, -1);
  }
  return { current, longest };
}

export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** "13:05" → "1:05 PM"; "09:00" → "9 AM". */
export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

/** "09:00"–"10:30" → "9–10:30 AM"; "11:00"–"13:00" → "11 AM–1 PM". */
export function formatTimeRange12(start: string, end: string): string {
  const a = formatTime12(start);
  const b = formatTime12(end);
  const [aTime, aSuffix] = a.split(" ");
  return aSuffix === b.split(" ")[1] ? `${aTime}–${b}` : `${a}–${b}`;
}
