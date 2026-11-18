import type { ReactNode } from "react";
import { formatMinutes } from "@shared/time";

export const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" } as const;
export const GRID = "var(--border)";
export const ACTUAL = "var(--brand)";
export const PLANNED = "color-mix(in oklch, var(--muted-foreground) 35%, transparent)";

export const hoursTick = (v: number) => (v === 0 ? "0" : v < 60 ? `${Math.round(v)}m` : `${Math.round((v / 60) * 10) / 10}h`);

/** Recharts tooltip body using text tokens; colored swatches carry identity. */
export function ChartTooltip({
  active,
  label,
  payload,
  labelFormat,
  valueFormat = (v) => formatMinutes(v),
}: {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }[];
  labelFormat?: (l: string) => ReactNode;
  valueFormat?: (v: number, key?: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
      {label !== undefined ? <div className="mb-1 font-medium">{labelFormat ? labelFormat(String(label)) : label}</div> : null}
      <div className="space-y-0.5">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-sm" style={{ backgroundColor: p.color }} />
              {p.name}
            </span>
            <span className="font-medium tabular">{valueFormat(Number(p.value ?? 0), String(p.dataKey))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/** Simple horizontal bar row (label left, bar, value right) — used for distributions. */
export function BarRow({
  label,
  value,
  max,
  color,
  display,
  icon,
}: {
  label: ReactNode;
  value: number;
  max: number;
  color: string;
  display: string;
  icon?: ReactNode;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-3 text-sm">
      <span className="flex min-w-0 items-center gap-2 truncate">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </span>
      <span className="text-xs text-muted-foreground tabular">{display}</span>
    </div>
  );
}
