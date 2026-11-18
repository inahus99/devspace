import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";

// All calendar dates are local "YYYY-MM-DD" strings. Never round-trip them through
// UTC (new Date("2026-01-05") is UTC midnight and shifts a day west of Greenwich).

export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Parse YYYY-MM-DD as a *local* date. */
export function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function formatDay(s: string, pattern = "EEE, MMM d"): string {
  return format(fromISODate(s), pattern);
}

export function relativeDay(s: string): string {
  const d = fromISODate(s);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, MMM d");
}

/** "3h ago" for ISO timestamps. */
export function timeAgo(iso: string): string {
  return `${formatDistanceToNowStrict(parseISO(iso))} ago`;
}

export function formatTimestamp(iso: string, pattern = "MMM d, yyyy · HH:mm"): string {
  return format(parseISO(iso), pattern);
}

/** "09:30:00" → "09:30" */
export function shortTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}
