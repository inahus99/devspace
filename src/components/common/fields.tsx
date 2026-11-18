import { Check, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";
import type { Folder } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTags, useWorkspaceFolders, useWorkspaces } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { WorkspaceIcon } from "./WorkspaceIcon";

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enum select
// ---------------------------------------------------------------------------

const NONE = "__none__";

export function EnumSelect<T extends string>({
  value,
  onChange,
  options,
  labels,
  placeholder,
  allowNone,
  noneLabel = "None",
  className,
  id,
  size = "default",
}: {
  value: T | null | undefined;
  onChange: (v: T | null) => void;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
  id?: string;
  size?: "sm" | "default";
}) {
  return (
    <Select value={value ?? (allowNone ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? null : (v as T))}>
      <SelectTrigger id={id} className={cn("w-full", className)} size={size}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {labels?.[o] ?? o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Workspace & folder selects
// ---------------------------------------------------------------------------

export function WorkspaceSelect({
  value,
  onChange,
  allowNone,
  noneLabel = "No workspace",
  kinds,
  id,
  className,
}: {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  /** Prefer workspaces of these kinds (others still listed after). */
  kinds?: string[];
  id?: string;
  className?: string;
}) {
  const { data } = useWorkspaces();
  const list = useMemo(() => {
    const active = (data ?? []).filter((w) => !w.archivedAt || w.id === value);
    if (!kinds) return active;
    return [...active.filter((w) => kinds.includes(w.kind)), ...active.filter((w) => !kinds.includes(w.kind))];
  }, [data, kinds, value]);
  return (
    <Select value={value ?? (allowNone ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue placeholder="Choose a workspace" />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
        {list.map((w) => (
          <SelectItem key={w.id} value={w.id}>
            <span className="flex items-center gap-2">
              <WorkspaceIcon icon={w.icon} color={w.color} size="sm" />
              {w.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Depth-first ordered folder list with depth for indentation. */
export function flattenFolders(folders: Folder[]): { folder: Folder; depth: number; path: string }[] {
  const children = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const list = children.get(f.parentId) ?? [];
    list.push(f);
    children.set(f.parentId, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  const out: { folder: Folder; depth: number; path: string }[] = [];
  const walk = (parent: string | null, depth: number, prefix: string) => {
    for (const f of children.get(parent) ?? []) {
      const path = prefix ? `${prefix} / ${f.name}` : f.name;
      out.push({ folder: f, depth, path });
      walk(f.id, depth + 1, path);
    }
  };
  walk(null, 0, "");
  return out;
}

export function FolderSelect({
  workspaceId,
  value,
  onChange,
  id,
  className,
  exclude,
  rootLabel = "No folder (workspace root)",
}: {
  workspaceId: string | null | undefined;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  id?: string;
  className?: string;
  /** Hide this folder and its descendants (for "move folder"). */
  exclude?: string;
  rootLabel?: string;
}) {
  const folders = useWorkspaceFolders(workspaceId);
  const flat = useMemo(() => {
    const all = flattenFolders(folders);
    if (!exclude) return all;
    const banned = new Set([exclude]);
    for (const { folder } of all) if (folder.parentId && banned.has(folder.parentId)) banned.add(folder.id);
    return all.filter((f) => !banned.has(f.folder.id));
  }, [folders, exclude]);
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={!workspaceId}>
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue placeholder="Folder" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{rootLabel}</SelectItem>
        {flat.map(({ folder, depth }) => (
          <SelectItem key={folder.id} value={folder.id}>
            <span style={{ paddingLeft: depth * 12 }}>{folder.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export function TagInput({
  value,
  onChange,
  placeholder = "Add tag…",
  className,
  id,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const { data: allTags } = useTags();
  const normalized = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");
  const suggestions = useMemo(() => {
    const d = normalized(draft);
    if (!d) return [];
    return (allTags ?? []).filter((t) => t.name.includes(d) && !value.includes(t.name)).slice(0, 6);
  }, [allTags, draft, value]);

  const add = (raw: string) => {
    const t = normalized(raw);
    if (t && !value.includes(t) && value.length < 30) onChange([...value, t]);
    setDraft("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault();
        add(draft);
      }
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs dark:bg-input/30",
          focused && "border-ring ring-[3px] ring-ring/50",
        )}
      >
        {value.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1 pr-1 font-normal">
            #{t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="rounded hover:bg-background/60">
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (draft.trim()) add(draft);
          }}
          placeholder={value.length ? "" : placeholder}
          className="min-w-[80px] flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
        />
      </div>
      {focused && suggestions.length > 0 ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                add(s.name);
              }}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-accent"
            >
              #{s.name}
              <span className="text-xs text-muted-foreground">{s.count}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TagList({ tags, className }: { tags: string[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tags.map((t) => (
        <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
          #{t}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-select chips (design patterns, SOLID, etc.)
// ---------------------------------------------------------------------------

export function ChipMultiSelect({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  labels?: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
              on ? "border-brand/40 bg-brand-soft text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {on ? <Check className="size-3" /> : null}
            {labels?.[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}

