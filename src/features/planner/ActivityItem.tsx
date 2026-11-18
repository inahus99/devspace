import { Check, Clock, ExternalLink, Timer } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import type { Activity, ActivityWithLink } from "@shared/types";
import { formatMinutes } from "@shared/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { relativeDay } from "@/lib/dates";
import { useUpdate, useWorkspaceMap } from "@/lib/queries";
import { contentHref } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { ActivityDialog } from "./ActivityDialog";
import { linkMeta, timeLabel } from "./lib";

/** Accessible completion checkbox with a clear checkmark. */
export function CompleteToggle({
  completed,
  onToggle,
  label,
  size = "md",
}: {
  completed: boolean;
  onToggle: () => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={completed}
      aria-label={completed ? `Mark "${label}" incomplete` : `Mark "${label}" complete`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        size === "sm" ? "size-4" : "size-5",
        completed ? "border-success bg-success text-white" : "border-muted-foreground/40 hover:border-success hover:bg-success/10",
      )}
    >
      {completed ? <Check className={size === "sm" ? "size-2.5" : "size-3"} strokeWidth={3.5} /> : null}
    </button>
  );
}

/** Toggle completion with an optimistic UI state. */
export function useToggleActivity() {
  const update = useUpdate("activities");
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const toggle = (a: Activity) => {
    const next = !a.completed;
    setPending((p) => ({ ...p, [a.id]: next }));
    update.mutate(
      { id: a.id, completed: next },
      {
        onSettled: () =>
          setPending((p) => {
            const { [a.id]: _drop, ...rest } = p;
            void _drop;
            return rest;
          }),
      },
    );
  };
  const isCompleted = (a: Activity) => pending[a.id] ?? a.completed;
  return { toggle, isCompleted };
}

export function ActivityItem({
  activity,
  showDate,
  compact,
  className,
}: {
  activity: ActivityWithLink;
  showDate?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const { toggle, isCompleted } = useToggleActivity();
  const wsMap = useWorkspaceMap();
  const ws = activity.workspaceId ? wsMap.get(activity.workspaceId) : undefined;
  const done = isCompleted(activity);
  const time = timeLabel(activity);
  const link = activity.link;
  const LinkIcon = link ? linkMeta(link.type).icon : null;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target === e.currentTarget) setEditing(true);
        }}
        className={cn(
          "group flex w-full items-start gap-3 rounded-md px-2 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
          compact ? "py-1.5" : "py-2",
          className,
        )}
      >
        <div className="pt-0.5">
          <CompleteToggle completed={done} onToggle={() => toggle(activity)} label={activity.title} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-sm", done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{activity.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            {showDate ? <span>{relativeDay(activity.date)}</span> : null}
            {time ? (
              <span className="inline-flex items-center gap-1 tabular">
                <Clock className="size-3" />
                {time}
              </span>
            ) : activity.plannedMinutes > 0 ? (
              <span className="inline-flex items-center gap-1 tabular">
                <Clock className="size-3" />
                {formatMinutes(activity.plannedMinutes)} planned
              </span>
            ) : null}
            {activity.actualMinutes > 0 ? (
              <span className={cn("inline-flex items-center gap-1 tabular", done && "text-success")}>
                <Timer className="size-3" />
                {formatMinutes(activity.actualMinutes)} logged
              </span>
            ) : null}
            {ws ? (
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: ws.color }} />
                {ws.name}
              </span>
            ) : null}
            {link && LinkIcon ? (
              <Link
                to={contentHref(link.type, link.id)}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex max-w-[220px] items-center gap-1 rounded bg-muted px-1.5 py-px text-foreground/80 hover:bg-accent hover:text-foreground"
              >
                <LinkIcon className="size-3 shrink-0" />
                <span className="truncate">{link.title}</span>
              </Link>
            ) : null}
            {link?.type === "resource" && link.url ? (
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center rounded p-0.5 hover:bg-accent hover:text-foreground"
                aria-label="Open resource link"
              >
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
        </div>
        {!compact ? <RecordTime activity={activity} /> : null}
      </div>
      <ActivityDialog open={editing} onOpenChange={setEditing} activity={activity} />
    </>
  );
}

function RecordTime({ activity }: { activity: ActivityWithLink }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const update = useUpdate("activities");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 0 || n > 1440) return;
    update.mutate({ id: activity.id, actualMinutes: n, ...(n > 0 && !activity.completed ? { completed: true } : {}) }, { onSuccess: () => setOpen(false) });
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(activity.actualMinutes ? String(activity.actualMinutes) : String(activity.plannedMinutes || ""));
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded px-1.5 py-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
          aria-label="Record time spent"
        >
          <Timer className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3" align="end" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} className="grid gap-2">
          <label htmlFor={`rt-${activity.id}`} className="text-xs font-medium text-muted-foreground">
            Time spent (minutes)
          </label>
          <div className="flex gap-2">
            <Input id={`rt-${activity.id}`} type="number" min={0} max={1440} autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
            <Button type="submit" size="sm" className="h-9" disabled={update.isPending}>
              Save
            </Button>
          </div>
          <p className="text-2xs text-muted-foreground">Recording time marks the activity complete.</p>
        </form>
      </PopoverContent>
    </Popover>
  );
}
