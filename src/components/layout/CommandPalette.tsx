import {
  BarChart3, BookOpen, Boxes, CalendarCheck2, CalendarDays, CalendarPlus, Code2, FileText, Folder, Layers, LayoutDashboard,
  Library, Link2, ListChecks, Moon, Plus, Settings, Binary,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { SearchResult, SearchResultType } from "@shared/types";
import { Kbd, Spinner } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useTheme } from "@/hooks/useTheme";
import { useSearch, useWorkspaces } from "@/lib/queries";
import { contentHref, routes } from "@/lib/routes";
import { type CaptureKind, useUi } from "@/stores/ui";

const TYPE_META: Record<SearchResultType, { label: string; icon: typeof FileText }> = {
  workspace: { label: "Workspace", icon: Layers },
  folder: { label: "Folder", icon: Folder },
  note: { label: "Note", icon: FileText },
  snippet: { label: "Snippet", icon: Code2 },
  dsa: { label: "DSA problem", icon: Binary },
  lld: { label: "LLD exercise", icon: Boxes },
  resource: { label: "Resource", icon: Link2 },
  book: { label: "Book", icon: BookOpen },
};

const CAPTURE: { kind: CaptureKind; label: string; icon: typeof FileText; hint: string }[] = [
  { kind: "note", label: "New note", icon: FileText, hint: "N" },
  { kind: "snippet", label: "New code snippet", icon: Code2, hint: "S" },
  { kind: "resource", label: "Save a resource / link", icon: Link2, hint: "R" },
  { kind: "dsa", label: "New DSA problem", icon: Binary, hint: "D" },
  { kind: "lld", label: "New LLD exercise", icon: Boxes, hint: "L" },
  { kind: "activity", label: "Plan an activity", icon: CalendarPlus, hint: "A" },
  { kind: "book", label: "Add a book", icon: BookOpen, hint: "B" },
  { kind: "workspace", label: "New workspace", icon: Plus, hint: "W" },
];

const NAV = [
  { to: routes.dashboard(), label: "Dashboard", icon: LayoutDashboard },
  { to: routes.workspaces(), label: "My Workspaces", icon: Layers },
  { to: routes.calendar(), label: "Master Calendar", icon: CalendarDays },
  { to: routes.planner(), label: "Daily Planner", icon: CalendarCheck2 },
  { to: routes.resources(), label: "Resource Library", icon: Library },
  { to: routes.books(), label: "Bookshelf", icon: BookOpen },
  { to: routes.analytics(), label: "Analytics", icon: BarChart3 },
  { to: routes.settings(), label: "Settings & export", icon: Settings },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const openCapture = useUi((s) => s.openCapture);
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 150);
  const { data: results, isFetching } = useSearch(debounced);
  const { data: workspaces } = useWorkspaces();
  const { toggle } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const term = q.trim().toLowerCase();
  const captures = CAPTURE.filter((c) => !term || c.label.toLowerCase().includes(term));
  const navs = NAV.filter((n) => !term || n.label.toLowerCase().includes(term));
  const grouped = new Map<SearchResultType, SearchResult[]>();
  for (const r of results ?? []) grouped.set(r.type, [...(grouped.get(r.type) ?? []), r]);
  const showResults = term.length > 0 && debounced.trim().length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Search everything or create something new" shouldFilter={false} className="sm:max-w-xl">
      <CommandInput value={q} onValueChange={setQ} placeholder="Search notes, problems, resources… or type a command" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>{isFetching ? <Spinner className="mx-auto" /> : `No results for “${q}”`}</CommandEmpty>

        {showResults
          ? [...grouped.entries()].map(([type, items]) => {
              const meta = TYPE_META[type];
              return (
                <CommandGroup key={type} heading={`${meta.label}s`}>
                  {items.map((r) => (
                    <CommandItem key={`${type}-${r.id}`} value={`${type}-${r.id}`} onSelect={() => go(contentHref(r.type, r.id, r.workspaceId))}>
                      <meta.icon className="text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{r.title || "Untitled"}</div>
                        {r.subtitle ? <div className="truncate text-xs text-muted-foreground">{r.subtitle}</div> : null}
                      </div>
                      {r.workspaceName && type !== "workspace" ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: r.workspaceColor ?? undefined }} />
                          {r.workspaceName}
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })
          : null}

        {captures.length ? (
          <>
            {showResults && grouped.size ? <CommandSeparator /> : null}
            <CommandGroup heading="Quick capture">
              {captures.map((c) => (
                <CommandItem key={c.kind} value={`capture-${c.kind}`} onSelect={() => openCapture(c.kind)}>
                  <c.icon className="text-muted-foreground" />
                  {c.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {!term && workspaces?.some((w) => !w.archivedAt) ? (
          <CommandGroup heading="Workspaces">
            {workspaces
              .filter((w) => !w.archivedAt)
              .map((w) => (
                <CommandItem key={w.id} value={`ws-${w.id}`} onSelect={() => go(routes.workspace(w.id))}>
                  <WorkspaceIcon icon={w.icon} color={w.color} size="sm" />
                  {w.name}
                </CommandItem>
              ))}
          </CommandGroup>
        ) : null}

        {navs.length ? (
          <CommandGroup heading="Go to">
            {navs.map((n) => (
              <CommandItem key={n.to} value={`nav-${n.label}`} onSelect={() => go(n.to)}>
                <n.icon className="text-muted-foreground" />
                {n.label}
              </CommandItem>
            ))}
            {!term || "today planner".includes(term) ? (
              <CommandItem value="nav-today" onSelect={() => go(routes.planner())}>
                <ListChecks className="text-muted-foreground" />
                Today's plan
              </CommandItem>
            ) : null}
          </CommandGroup>
        ) : null}

        {!term || "theme dark light".includes(term) ? (
          <CommandGroup heading="Preferences">
            <CommandItem
              value="toggle-theme"
              onSelect={() => {
                toggle();
                setOpen(false);
              }}
            >
              <Moon className="text-muted-foreground" />
              Toggle dark / light mode
              <CommandShortcut>
                <Kbd>Theme</Kbd>
              </CommandShortcut>
            </CommandItem>
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
