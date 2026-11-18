import { Check, ChevronsUpDown, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { ActivityInput } from "@shared/schemas";
import type { ActivityLinkType, ActivityWithLink } from "@shared/types";
import { formatMinutes, intervalMinutes } from "@shared/time";
import { type CaptureDialogProps, str } from "@/components/common/capture";
import { confirm } from "@/components/common/ConfirmDialog";
import { EnumSelect, Field, WorkspaceSelect } from "@/components/common/fields";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/dates";
import { useCreate, useDelete, useList, useUpdate } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { activityLinkRef, LINK_FIELDS, LINK_TYPES, linkMeta } from "./lib";

interface FormState {
  title: string;
  description: string;
  workspaceId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  plannedMinutes: string;
  actualMinutes: string;
  completed: boolean;
  notes: string;
  linkType: ActivityLinkType | null;
  linkId: string | null;
}

function initialState(defaults: Record<string, unknown> | undefined, activity?: ActivityWithLink): FormState {
  if (activity) {
    const ref = activityLinkRef(activity);
    return {
      title: activity.title,
      description: activity.description,
      workspaceId: activity.workspaceId,
      date: activity.date,
      startTime: activity.startTime?.slice(0, 5) ?? "",
      endTime: activity.endTime?.slice(0, 5) ?? "",
      plannedMinutes: activity.plannedMinutes ? String(activity.plannedMinutes) : "",
      actualMinutes: activity.actualMinutes ? String(activity.actualMinutes) : "",
      completed: activity.completed,
      notes: activity.notes,
      linkType: ref?.type ?? null,
      linkId: ref?.id ?? null,
    };
  }
  const d = defaults ?? {};
  let linkType: ActivityLinkType | null = null;
  let linkId: string | null = null;
  for (const l of LINK_TYPES) {
    const id = str(d[l.field]);
    if (id) {
      linkType = l.type;
      linkId = id;
      break;
    }
  }
  const start = str(d.startTime)?.slice(0, 5) ?? "";
  return {
    title: str(d.title) ?? "",
    description: "",
    workspaceId: str(d.workspaceId) ?? null,
    date: str(d.date) ?? todayISO(),
    startTime: start,
    endTime: str(d.endTime)?.slice(0, 5) ?? (start ? addHour(start) : ""),
    plannedMinutes: "",
    actualMinutes: "",
    completed: false,
    notes: "",
    linkType,
    linkId,
  };
}

function addHour(t: string): string {
  const [h = 0, m = 0] = t.split(":").map(Number);
  const nh = Math.min(h + 1, 23);
  return `${String(nh).padStart(2, "0")}:${String(h + 1 > 23 ? 59 : m).padStart(2, "0")}`;
}

function toInt(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 1440) : undefined;
}

export function ActivityDialog({ open, onOpenChange, defaults, activity }: CaptureDialogProps & { activity?: ActivityWithLink }) {
  const [form, setForm] = useState<FormState>(() => initialState(defaults, activity));
  const [error, setError] = useState<string | null>(null);
  const create = useCreate("activities");
  const update = useUpdate("activities");
  const del = useDelete("activities");
  const editing = !!activity;

  useEffect(() => {
    if (open) {
      setForm(initialState(defaults, activity));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const span = intervalMinutes(form.startTime || null, form.endTime || null);
  const timeError = form.startTime && form.endTime && span === null ? "End time must be after start time" : !form.startTime && form.endTime ? "Add a start time" : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError("Give the activity a title");
    if (timeError) return setError(timeError);
    setError(null);
    const links = Object.fromEntries(LINK_FIELDS.map((f) => [f, null])) as Record<(typeof LINK_FIELDS)[number], string | null>;
    if (form.linkType && form.linkId) links[linkMeta(form.linkType).field] = form.linkId;
    const payload: ActivityInput = {
      title: form.title.trim(),
      description: form.description,
      workspaceId: form.workspaceId,
      date: form.date,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      plannedMinutes: span ?? toInt(form.plannedMinutes) ?? 0,
      completed: form.completed,
      notes: form.notes,
      ...links,
    };
    const actual = toInt(form.actualMinutes);
    if (actual !== undefined) payload.actualMinutes = actual;
    else if (editing && form.actualMinutes.trim() === "" && activity.actualMinutes > 0) payload.actualMinutes = 0;
    try {
      if (editing) await update.mutateAsync({ id: activity.id, ...payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch {
      /* toast shown */
    }
  };

  const remove = async () => {
    if (!activity) return;
    if (await confirm({ title: "Delete this activity?", description: "It will disappear from the planner, calendar and analytics.", destructive: true })) {
      await del.mutateAsync(activity.id).catch(() => {});
      onOpenChange(false);
    }
  };

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit activity" : "New activity"}</DialogTitle>
          <DialogDescription>Activities feed the planner, master calendar, dashboard and analytics.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="Title" htmlFor="act-title" error={error && !form.title.trim() ? error : null}>
            <Input id="act-title" autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Solve 3 sliding-window problems" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Workspace">
              <WorkspaceSelect value={form.workspaceId} onChange={(v) => set("workspaceId", v)} allowNone />
            </Field>
            <Field label="Date" htmlFor="act-date">
              <Input id="act-date" type="date" value={form.date} onChange={(e) => e.target.value && set("date", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Start (optional)" htmlFor="act-start">
              <Input id="act-start" type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </Field>
            <Field label="End (optional)" htmlFor="act-end" error={timeError}>
              <Input id="act-end" type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </Field>
            <Field label="Planned minutes" htmlFor="act-planned" hint={span !== null ? `From times: ${formatMinutes(span)}` : undefined}>
              <Input
                id="act-planned"
                type="number"
                min={0}
                max={1440}
                inputMode="numeric"
                disabled={span !== null}
                value={span !== null ? String(span) : form.plannedMinutes}
                onChange={(e) => set("plannedMinutes", e.target.value)}
                placeholder="60"
              />
            </Field>
          </div>
          <div className="grid items-end gap-4 sm:grid-cols-2">
            <Field label="Actual time recorded (minutes)" htmlFor="act-actual" hint="Leave empty when completing to record the planned time.">
              <Input
                id="act-actual"
                type="number"
                min={0}
                max={1440}
                inputMode="numeric"
                value={form.actualMinutes}
                onChange={(e) => set("actualMinutes", e.target.value)}
                placeholder="0"
              />
            </Field>
            <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
              <Switch checked={form.completed} onCheckedChange={(v) => set("completed", v)} />
              Completed
            </label>
          </div>
          <LinkPicker
            workspaceId={form.workspaceId}
            linkType={form.linkType}
            linkId={form.linkId}
            initialTitle={activity?.link?.title}
            onChange={(type, id) => setForm((f) => ({ ...f, linkType: type, linkId: id }))}
          />
          <Field label="Description" htmlFor="act-desc">
            <Textarea id="act-desc" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What will you work on?" />
          </Field>
          <Field label="Notes" htmlFor="act-notes">
            <Textarea id="act-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Reflections, blockers, what to do next…" />
          </Field>
          {error && form.title.trim() ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void remove()}>
                <Trash2 /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Add activity"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinkPicker({
  workspaceId,
  linkType,
  linkId,
  initialTitle,
  onChange,
}: {
  workspaceId: string | null;
  linkType: ActivityLinkType | null;
  linkId: string | null;
  initialTitle?: string;
  onChange: (type: ActivityLinkType | null, id: string | null) => void;
}) {
  const meta = linkType ? linkMeta(linkType) : null;
  const [open, setOpen] = useState(false);
  const params = meta?.workspaceScoped && workspaceId ? { workspaceId, limit: 300 } : { limit: 300 };
  const { data, isLoading } = useList(meta?.entity ?? "notes", params, { enabled: !!meta });
  const items = useMemo(
    () => ((data ?? []) as { id: string; title: string }[]).map((i) => ({ id: i.id, title: i.title || "Untitled" })),
    [data],
  );
  const selected = items.find((i) => i.id === linkId)?.title ?? (linkId ? (initialTitle ?? "Selected item") : null);

  return (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
      <Field label="Linked content">
        <EnumSelect
          value={linkType}
          onChange={(v) => onChange(v, null)}
          options={LINK_TYPES.map((l) => l.type)}
          labels={Object.fromEntries(LINK_TYPES.map((l) => [l.type, l.label]))}
          allowNone
          noneLabel="None"
        />
      </Field>
      <Field label={meta ? meta.label : "Item"}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" disabled={!meta} className="w-full justify-between font-normal" aria-label="Choose linked item">
              <span className={cn("truncate", !selected && "text-muted-foreground")}>
                {selected ?? (meta ? `Choose a ${meta.label.toLowerCase()}…` : "Pick a type first")}
              </span>
              <span className="flex items-center gap-1">
                {linkId ? (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Clear link"
                    className="rounded p-0.5 hover:bg-accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(linkType, null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        onChange(linkType, null);
                      }
                    }}
                  >
                    <X className="size-3.5" />
                  </span>
                ) : null}
                <ChevronsUpDown className="size-3.5 opacity-50" />
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search…" />
              <CommandList>
                <CommandEmpty>{isLoading ? "Loading…" : workspaceId && meta?.workspaceScoped ? "Nothing in this workspace." : "Nothing found."}</CommandEmpty>
                <CommandGroup>
                  {items.map((i) => (
                    <CommandItem
                      key={i.id}
                      value={`${i.title} ${i.id}`}
                      onSelect={() => {
                        onChange(linkType, i.id);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("size-3.5", i.id === linkId ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{i.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </Field>
    </div>
  );
}
