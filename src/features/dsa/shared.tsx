import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Compact multi-select filter button. */
export function MultiFilter<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (v: T[]) => void;
}) {
  const active = value.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 gap-1 font-normal", active && "border-brand/40 bg-brand-soft")}>
          {label}
          {active ? <span className="text-xs text-muted-foreground">· {value.length}</span> : null}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o}
            checked={value.includes(o)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) => onChange(on ? [...value, o] : value.filter((x) => x !== o))}
          >
            {labels[o]}
          </DropdownMenuCheckboxItem>
        ))}
        {active ? (
          <>
            <DropdownMenuSeparator />
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent" onClick={() => onChange([])}>
              Clear
            </button>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Thin horizontal proportion bar. */
export function MiniBar({ value, total, className, color }: { value: number; total: number; className?: string; color?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="img" aria-label={`${pct}%`}>
      <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const;
export const STATUS_ORDER = { todo: 0, attempted: 1, needs_revision: 2, solved: 3, mastered: 4 } as const;
