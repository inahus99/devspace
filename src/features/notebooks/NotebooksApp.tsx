import { ArrowLeft, ChevronRight, Code2, FileText, Folder as FolderIcon, Home as HomeIcon, Link2, FolderPlus, NotebookPen, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from "lucide-react";
import { type FormEvent, type ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useMatch, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import type { Folder, Workspace } from "@shared/types";
import { EmptyState, FullPageSpinner, Spinner } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAttachments, useCreateFolder, useFolders, useWorkspaces } from "@/lib/queries";
import { isNotesApp } from "@/lib/app";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { GoodNotesPdfs } from "@/features/workspaces/GoodNotesPdfs";
import { BooksSection, FolderCode, FolderLinks, FolderNotes } from "./Library";

const EXPANDED_KEY = "devspace.notebooks.expanded";
const SIDEBAR_KEY = "devspace.notebooks.sidebar";

function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* per-browser convenience only */
  }
}

type ShellContext = { sidebar: boolean; toggleSidebar: () => void };

/**
 * The Notes app's layout: folders and sub-folders on the left (the same workspaces and folders
 * as DevSpace), and the page on the right: a folder's notes, code, links and PDFs, or a
 * single note, snippet or the links library.
 */
export function NotesShell() {
  const selected = useMatch("/notebooks/:folderId")?.params.folderId ?? null;
  const workspaces = useWorkspaces();
  const folders = useFolders();
  const [sidebar, setSidebar] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) !== "closed";
    } catch {
      return true;
    }
  });
  const toggleSidebar = () => {
    setSidebar((open) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, open ? "closed" : "open");
      } catch {
        /* ignore */
      }
      return !open;
    });
  };

  useEffect(() => {
    const prev = document.title;
    document.title = isNotesApp ? "Notes" : "Notebooks · DevSpace";
    return () => void (document.title = prev);
  }, []);

  const navLink = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors hover:bg-accent",
      isActive ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex h-dvh min-h-0 bg-background text-foreground">
      <aside
        className={cn(
          "flex w-72 shrink-0 flex-col border-r bg-sidebar transition-[margin] duration-200",
          sidebar ? "ml-0" : "-ml-72",
        )}
        aria-label="Notes navigation"
        aria-hidden={!sidebar}
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
          <Link to="/notebooks" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <NotebookPen className="size-4" />
            </span>
            {isNotesApp ? "Notes" : "Notebooks"}
          </Link>
          <Button variant="ghost" size="icon" className="size-8" onClick={toggleSidebar} aria-label="Hide folders">
            <PanelLeftClose />
          </Button>
        </div>
        <nav className="space-y-0.5 px-2 pb-2" aria-label="Notes">
          <NavLink to="/notebooks" end className={navLink}>
            <HomeIcon className="size-4" /> Home
          </NavLink>
          <NavLink to={routes.resources()} className={navLink}>
            <Link2 className="size-4" /> All links
          </NavLink>
        </nav>
        {workspaces.isLoading || folders.isLoading ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : (
          <FolderTree workspaces={workspaces.data ?? []} folders={folders.data ?? []} selected={selected} />
        )}
        <div className="border-t p-2">
          <Link to={routes.dashboard()} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Back to DevSpace
          </Link>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<FullPageSpinner />}>
          <Outlet context={{ sidebar, toggleSidebar } satisfies ShellContext} />
        </Suspense>
      </main>
    </div>
  );
}

/** A note, snippet or the links library inside the Notes layout, scrolling on its own. */
export function NotesPage({ children }: { children: ReactNode }) {
  const { sidebar, toggleSidebar } = useOutletContext<ShellContext>();
  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto">
      {sidebar ? null : (
        <div className="sticky top-0 z-10 p-2">
          <SidebarToggle sidebar={sidebar} onToggle={toggleSidebar} />
        </div>
      )}
      {children}
    </div>
  );
}

/** Home (books) or one folder's notes, code, links and PDFs. */
export default function NotebooksApp() {
  const { folderId } = useParams<{ folderId?: string }>();
  const { sidebar, toggleSidebar } = useOutletContext<ShellContext>();
  const workspaces = useWorkspaces();
  const folders = useFolders();
  const folder = folderId ? folders.data?.find((f) => f.id === folderId) : undefined;

  if (!folderId)
    return <Home sidebar={sidebar} onToggleSidebar={toggleSidebar} />;
  if (folders.isLoading) return <FullPageSpinner />;
  if (!folder) return <EmptyState icon={FolderIcon} title="Folder not found" description="It may have been deleted." className="m-8" />;
  return <FolderPage key={folder.id} folder={folder} workspace={workspaces.data?.find((w) => w.id === folder.workspaceId)} folders={folders.data ?? []} sidebar={sidebar} onToggleSidebar={toggleSidebar} />;
}

// ---------------------------------------------------------------------------
// Folder tree
// ---------------------------------------------------------------------------

function FolderTree({
  workspaces,
  folders,
  selected,
}: {
  workspaces: Workspace[];
  folders: Folder[];
  selected: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => readSet(EXPANDED_KEY));
  const [query, setQuery] = useState("");
  const childrenOf = useMemo(() => {
    const m = new Map<string, Folder[]>();
    for (const f of folders) {
      const k = f.parentId ?? `ws:${f.workspaceId}`;
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    for (const list of m.values()) list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    return m;
  }, [folders]);

  // Keep the open folder's ancestors expanded.
  useEffect(() => {
    if (!selected) return;
    const byId = new Map(folders.map((f) => [f.id, f]));
    const add: string[] = [];
    let f = byId.get(selected);
    if (f) add.push(`ws:${f.workspaceId}`);
    while (f?.parentId) {
      add.push(f.parentId);
      f = byId.get(f.parentId);
    }
    if (add.some((id) => !expanded.has(id))) {
      const next = new Set([...expanded, ...add]);
      setExpanded(next);
      store(EXPANDED_KEY, [...next]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, folders]);

  const toggle = (id: string, open?: boolean) => {
    const next = new Set(expanded);
    if (open ?? !next.has(id)) next.add(id);
    else next.delete(id);
    setExpanded(next);
    store(EXPANDED_KEY, [...next]);
  };

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    // A folder is shown when it or any descendant matches.
    const keep = new Set<string>();
    const byId = new Map(folders.map((f) => [f.id, f]));
    for (const f of folders) {
      if (!f.name.toLowerCase().includes(q)) continue;
      let cur: Folder | undefined = f;
      while (cur) {
        keep.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
    }
    return keep;
  }, [q, folders]);

  return (
    <>
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a folder" className="h-8 bg-card pl-8 text-xs" aria-label="Find a folder" />
        </div>
      </div>
      <nav className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {workspaces.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">Create a workspace in DevSpace first; its folders show up here.</p>
        ) : null}
        {workspaces.map((w) => {
          const key = `ws:${w.id}`;
          const open = !!matches || expanded.has(key);
          const top = (childrenOf.get(key) ?? []).filter((f) => !matches || matches.has(f.id));
          if (matches && top.length === 0) return null;
          return (
            <div key={w.id} className="mb-1">
              <div className="group relative flex items-center gap-1 rounded-lg pr-1 hover:bg-accent/60">
                <button type="button" onClick={() => toggle(key)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px] font-semibold">
                  <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
                  <WorkspaceIcon icon={w.icon} color={w.color} size="sm" />
                  <span className="truncate">{w.name}</span>
                </button>
                <NewFolderButton workspaceId={w.id} parentId={null} onCreated={() => toggle(key, true)} />
              </div>
              {open && !matches ? (
                <NavLink
                  to={routes.notesWorkspace(w.id)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-lg py-1.5 pr-2 pl-8 text-[12px] transition-colors hover:bg-accent/60",
                      isActive ? "bg-accent font-medium text-primary" : "text-muted-foreground",
                    )
                  }
                >
                  <FileText className="size-3.5 shrink-0" /> Not in a folder
                </NavLink>
              ) : null}
              {open ? (
                <FolderLevel parent={key} depth={1} childrenOf={childrenOf} selected={selected} expanded={expanded} matches={matches} onToggle={toggle} />
              ) : null}
            </div>
          );
        })}
      </nav>
    </>
  );
}

function FolderLevel({
  parent,
  depth,
  childrenOf,
  selected,
  expanded,
  matches,
  onToggle,
}: {
  parent: string;
  depth: number;
  childrenOf: Map<string, Folder[]>;
  selected: string | null;
  expanded: Set<string>;
  matches: Set<string> | null;
  onToggle: (id: string, open?: boolean) => void;
}) {
  const list = (childrenOf.get(parent) ?? []).filter((f) => !matches || matches.has(f.id));
  if (!list.length) return null;
  return (
    <ul>
      {list.map((f) => {
        const kids = childrenOf.get(f.id) ?? [];
        const open = kids.length > 0 && (!!matches || expanded.has(f.id));
        return (
          <li key={f.id}>
            <div
              className={cn(
                "group relative flex items-center gap-0.5 rounded-lg pr-1 transition-colors",
                selected === f.id ? "bg-primary/10 text-primary" : "hover:bg-accent/60",
              )}
              style={{ paddingLeft: depth * 12 }}
            >
              <button
                type="button"
                onClick={() => kids.length && onToggle(f.id)}
                className={cn("flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground", !kids.length && "invisible")}
                aria-label={open ? `Collapse ${f.name}` : `Expand ${f.name}`}
                tabIndex={kids.length ? 0 : -1}
              >
                <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
              </button>
              <Link to={`/notebooks/${f.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-[13px]">
                <FolderIcon className="size-3.5 shrink-0 text-primary/60" />
                <span className={cn("truncate", selected === f.id && "font-medium")}>{f.name}</span>
              </Link>
              <NewFolderButton workspaceId={f.workspaceId} parentId={f.id} onCreated={() => onToggle(f.id, true)} />
            </div>
            {open ? (
              <FolderLevel parent={f.id} depth={depth + 1} childrenOf={childrenOf} selected={selected} expanded={expanded} matches={matches} onToggle={onToggle} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function NewFolderButton({ workspaceId, parentId, onCreated }: { workspaceId: string; parentId: string | null; onCreated: () => void }) {
  const create = useCreateFolder();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    create.mutate(
      { workspaceId, parentId, name: n },
      {
        onSuccess: (f) => {
          setName("");
          setOpen(false);
          onCreated();
          navigate(`/notebooks/${f.id}`);
        },
      },
    );
  };
  if (open)
    return (
      <form onSubmit={submit} className="absolute inset-x-0 top-full z-20 mt-1 flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-pop">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder={parentId ? "Sub-folder name" : "Folder name"}
          className="h-7 text-xs"
          aria-label="New folder name"
        />
        <Button type="submit" size="icon" className="size-7" disabled={!name.trim() || create.isPending} aria-label="Create folder">
          <Plus />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setOpen(false)} aria-label="Cancel">
          <X />
        </Button>
      </form>
    );
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-card hover:text-primary focus-visible:opacity-100"
      aria-label={parentId ? "New sub-folder" : "New folder"}
      title={parentId ? "New sub-folder" : "New folder"}
    >
      <FolderPlus className="size-3.5" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Home and a folder's page
// ---------------------------------------------------------------------------

function folderTrail(folder: Folder | undefined, folders: Folder[]) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const trail: Folder[] = [];
  let cur = folder;
  while (cur) {
    trail.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return trail;
}

function SidebarToggle({ sidebar, onToggle }: { sidebar: boolean; onToggle: () => void }) {
  if (sidebar) return null;
  return (
    <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onToggle} aria-label="Show folders">
      <PanelLeftOpen />
    </Button>
  );
}

function Home({ sidebar, onToggleSidebar }: { sidebar: boolean; onToggleSidebar: () => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center gap-2">
          <SidebarToggle sidebar={sidebar} onToggle={onToggleSidebar} />
          <div>
            <h1 className="text-[28px] leading-tight">Notes</h1>
            <p className="text-sm text-muted-foreground">Pick a folder on the left for its notes, code, links and GoodNotes PDFs.</p>
          </div>
        </div>
        <BooksSection />
      </div>
    </div>
  );
}

/** A folder: its notes, code, links and GoodNotes PDFs. */
function FolderPage({
  folder,
  workspace,
  folders,
  sidebar,
  onToggleSidebar,
}: {
  folder: Folder;
  workspace: Workspace | undefined;
  folders: Folder[];
  sidebar: boolean;
  onToggleSidebar: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "notes") as FolderTab;
  const trail = folderTrail(folder, folders);
  const place = { workspaceId: folder.workspaceId, folderId: folder.id };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b bg-card/70 px-3 py-2 backdrop-blur">
        <SidebarToggle sidebar={sidebar} onToggle={onToggleSidebar} />
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm" aria-label="Breadcrumb">
          {workspace ? (
            <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <WorkspaceIcon icon={workspace.icon} color={workspace.color} size="sm" />
              <span className="hidden sm:inline">{workspace.name}</span>
            </span>
          ) : null}
          {trail.map((t, i) => (
            <span key={t.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              {i === trail.length - 1 ? (
                <span className="truncate font-semibold">{t.name}</span>
              ) : (
                <Link to={`/notebooks/${t.id}`} className="truncate text-muted-foreground hover:text-foreground">
                  {t.name}
                </Link>
              )}
            </span>
          ))}
        </nav>
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" asChild>
          <Link to={routes.workspace(folder.workspaceId, { folder: folder.id })} title="Open this folder in DevSpace">
            DevSpace
          </Link>
        </Button>
      </header>
      <TabBar active={tab} onSelect={(id) => setParams({ tab: id })} />
      <FolderTabBody tab={tab} place={place} />
    </div>
  );
}

type Place = { workspaceId: string; folderId: string | null };

function FolderTabBody({ tab, place }: { tab: FolderTab; place: Place }) {
  if (tab === "code") return <FolderCode place={place} />;
  if (tab === "links") return <FolderLinks place={place} />;
  if (tab === "pdfs") return <FolderPdfs place={place} />;
  return <FolderNotes place={place} />;
}

function FolderPdfs({ place }: { place: Place }) {
  const files = useAttachments({ workspaceId: place.workspaceId, standalone: "1" });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        <GoodNotesPdfs workspaceId={place.workspaceId} folderId={place.folderId} files={files.data} loading={files.isLoading} />
      </div>
    </div>
  );
}

type FolderTab = "notes" | "code" | "links" | "pdfs";
const TABS: { id: FolderTab; label: string; icon: typeof NotebookPen }[] = [
  { id: "notes", label: "Notes", icon: FileText },
  { id: "code", label: "Code", icon: Code2 },
  { id: "links", label: "Links", icon: Link2 },
  { id: "pdfs", label: "GoodNotes PDFs", icon: NotebookPen },
];

function TabBar({ active, onSelect }: { active: FolderTab; onSelect: (id: FolderTab) => void }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b bg-card/40 px-3" aria-label="In this folder">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          aria-current={active === t.id ? "page" : undefined}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors",
            active === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <t.icon className="size-3.5" /> {t.label}
        </button>
      ))}
    </nav>
  );
}

/** Notes, code, links and PDFs saved at a workspace's top level, outside any folder. */
export function WorkspaceTopLevel() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { sidebar, toggleSidebar } = useOutletContext<ShellContext>();
  const workspaces = useWorkspaces();
  const ws = workspaces.data?.find((w) => w.id === workspaceId);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "notes") as FolderTab;
  if (workspaces.isLoading) return <FullPageSpinner />;
  if (!ws) return <EmptyState icon={FolderIcon} title="Workspace not found" description="It may have been deleted." className="m-8" />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b bg-card/70 px-3 py-2 backdrop-blur">
        <SidebarToggle sidebar={sidebar} onToggle={toggleSidebar} />
        <WorkspaceIcon icon={ws.icon} color={ws.color} size="sm" />
        <span className="truncate text-sm font-semibold">{ws.name}</span>
        <span className="text-sm text-muted-foreground">· not in a folder</span>
      </header>
      <TabBar active={tab} onSelect={(id) => setParams({ tab: id })} />
      <FolderTabBody tab={tab} place={{ workspaceId: ws.id, folderId: null }} />
    </div>
  );
}
