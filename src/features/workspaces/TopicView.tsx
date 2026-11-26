import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  FolderTree,
  LayoutGrid,
  NotebookPen,
  type LucideIcon,
  Plus,
} from "lucide-react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import type { Folder, Workspace } from "@shared/types";
import { BookStatusPill } from "@/components/common/Pill";
import { Spinner } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAttachments,
  useCreateFolder,
  useList,
} from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { CaptureKind } from "@/stores/ui";
import { GoodNotesPdfs } from "./GoodNotesPdfs";

/**
 * The Contents tab of a workspace or folder: the way into its notes (which live in the Notes
 * app), its sub-folders as cards, its GoodNotes PDFs, and on a workspace's main page its books.
 * Questions, design exercises and files have their own tabs.
 */
export function TopicView({
  workspace,
  folder,
  folders,
  onOpenFolder,
  capture,
}: {
  workspace: Workspace;
  folder: Folder | null;
  folders: Folder[];
  onOpenFolder: (id: string) => void;
  capture: (kind: CaptureKind) => void;
}) {
  const here = folder?.id ?? null;
  const kind = workspace.kind;
  const scope = { workspaceId: workspace.id };
  // One workspace-wide fetch per kind; sections and folder-card counts are derived from it.
  const questions = useList("dsa", scope);
  const exercises = useList("lld", scope);
  const books = useList("books", scope, { enabled: !folder });
  const files = useAttachments({ ...scope, standalone: "1" });

  const children = folders
    .filter((f) => f.parentId === here)
    .sort((a, b) => a.position - b.position);
  const cardInfo = useMemo(() => {
    const count = new Map<string, number>();
    const bump = (rows: { folderId: string | null }[] | undefined) => {
      for (const r of rows ?? [])
        if (r.folderId) count.set(r.folderId, (count.get(r.folderId) ?? 0) + 1);
    };
    for (const rows of [
      questions.data,
      exercises.data,
      files.data,
    ])
      bump(rows);
    const cover = new Map<string, string>();
    for (const a of files.data ?? [])
      if (a.kind === "image" && a.folderId && !cover.has(a.folderId))
        cover.set(a.folderId, a.url);
    return { count, cover };
  }, [
    questions.data,
    exercises.data,
    files.data,
  ]);

  const wsBooks = folder ? [] : (books.data ?? []);
  const title = folder?.name ?? workspace.name;

  const showBooks = !folder && (kind === "general" || wsBooks.length > 0);

  const sections: ReactNode[] = [];
  if (showBooks)
    sections.push(
      <TopicSection
        key="books"
        icon={BookOpen}
        title="Books"
        count={wsBooks.length}
        loading={books.isLoading}
        onAdd={() => capture("book")}
        addLabel="Book"
        empty="The books you are reading for this subject."
      >
        {wsBooks.map((b) => {
          const pct = b.totalPages
            ? Math.round((b.currentPage / b.totalPages) * 100)
            : null;
          return (
            <li key={b.id}>
              <Link
                to={routes.book(b.id)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent/60"
              >
                {b.coverUrl ? (
                  <img
                    src={b.coverUrl}
                    alt=""
                    loading="lazy"
                    className="h-12 w-9 shrink-0 rounded-sm border object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-9 shrink-0 items-center justify-center rounded-sm border bg-secondary">
                    <BookOpen className="size-3.5 text-primary/60" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{b.title}</span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {b.author || "Unknown author"}
                    {pct !== null ? ` · ${pct}% read` : ""}
                  </span>
                </span>
                <BookStatusPill status={b.status} />
              </Link>
            </li>
          );
        })}
      </TopicSection>,
    );
  const notesHref = here ? routes.notebooks(here, { tab: "notes" }) : routes.notesWorkspace(workspace.id);

  return (
    <div className="space-y-6">
      {/* Writing happens in the Notes app; this is the one way in. */}
      <Link
        to={notesHref}
        className="group flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-soft transition-colors hover:border-primary/40 sm:flex-row sm:items-center"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <NotebookPen className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">Your notes for {title}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">Typed notes, code and links are in the Notes app. Handwriting from GoodNotes is saved below as PDFs.</span>
        </span>
        <span className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform group-hover:translate-x-0.5 sm:self-auto">
          Go to Notes <ArrowRight className="size-4" />
        </span>
      </Link>

      <SubTopics
        workspaceId={workspace.id}
        parentId={here}
        parentName={title}
        folders={children}
        allFolders={folders}
        count={cardInfo.count}
        cover={cardInfo.cover}
        onOpen={onOpenFolder}
      />

      <GoodNotesPdfs workspaceId={workspace.id} folderId={here} files={files.data} loading={files.isLoading} />

      {sections}
    </div>
  );
}

function SubTopics({
  workspaceId,
  parentId,
  parentName,
  folders,
  allFolders,
  count,
  cover,
  onOpen,
}: {
  workspaceId: string;
  parentId: string | null;
  parentName: string;
  folders: Folder[];
  allFolders: Folder[];
  count: Map<string, number>;
  cover: Map<string, string>;
  onOpen: (id: string) => void;
}) {
  const create = useCreateFolder();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [view, setView] = useState<FolderView>(readFolderView);
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, Folder[]>();
    for (const f of allFolders)
      m.set(f.parentId, [...(m.get(f.parentId) ?? []), f]);
    for (const list of m.values()) list.sort((a, b) => a.position - b.position);
    return m;
  }, [allFolders]);
  const changeView = (v: FolderView) => {
    setView(v);
    try {
      localStorage.setItem(FOLDER_VIEW_KEY, v);
    } catch {
      /* per-browser preference only */
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    create.mutate(
      { workspaceId, parentId, name: n },
      { onSuccess: () => (setName(""), setAdding(false)) },
    );
  };

  // A leaf folder (e.g. one pattern) doesn't need a big empty grid, just a quiet way to nest further.
  if (parentId && folders.length === 0 && !adding) {
    return (
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setAdding(true)}
        >
          <FolderPlus /> Add sub-folder
        </Button>
      </div>
    );
  }

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-tight">
          {parentId ? "Inside this folder" : "Topics"}
          {folders.length ? (
            <span className="ml-1.5 font-normal text-muted-foreground">
              {folders.length}
            </span>
          ) : null}
        </h2>
        {folders.length ? (
          <div
            className="flex items-center rounded-lg border bg-card p-0.5 shadow-xs"
            role="group"
            aria-label="Folder layout"
          >
            {(
              [
                ["grid", LayoutGrid, "Cards"],
                ["tree", FolderTree, "All folders"],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => changeView(v)}
                aria-pressed={view === v}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                  view === v
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {view === "tree" && folders.length ? (
        <div className="rounded-xl border bg-card p-1.5 shadow-soft">
          <FolderOutline
            parentId={parentId}
            childrenOf={childrenOf}
            count={count}
            onOpen={onOpen}
            depth={0}
          />
          {adding ? null : (
            <button
              type="button"
              onClick={() => (setAdding(true), changeView("grid"))}
              className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-primary"
            >
              <FolderPlus className="size-3.5" />{" "}
              {parentId ? `New folder in ${parentName}` : "New topic"}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {folders.map((f) => {
            const img = f.bannerUrl || cover.get(f.id);
            const n = count.get(f.id) ?? 0;
            const subs = childrenOf.get(f.id) ?? [];
            return (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(f.id)}
                onKeyDown={(e) => {
                  if (
                    e.target === e.currentTarget &&
                    (e.key === "Enter" || e.key === " ")
                  ) {
                    e.preventDefault();
                    onOpen(f.id);
                  }
                }}
                className="group cursor-pointer overflow-hidden rounded-xl border bg-card text-left shadow-soft transition-[border-color,box-shadow,transform] outline-none hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-pop focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="relative h-24 overflow-hidden bg-secondary">
                  {img ? (
                    <img
                      src={img}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      style={
                        f.bannerUrl
                          ? { objectPosition: `50% ${f.bannerPosition}%` }
                          : undefined
                      }
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <FolderIcon className="size-7 text-primary/40" />
                    </div>
                  )}
                </div>
                <div className="px-3.5 py-3">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {summary(n, subs.length)}
                  </p>
                  {subs.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {subs.slice(0, 4).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(c.id);
                          }}
                          className="max-w-full truncate rounded-md bg-secondary px-1.5 py-0.5 text-2xs font-medium text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                        >
                          {c.name}
                        </button>
                      ))}
                      {subs.length > 4 ? (
                        <span className="px-1 py-0.5 text-2xs text-muted-foreground">
                          +{subs.length - 4}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {adding ? (
            <form
              onSubmit={submit}
              className="flex flex-col justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-card p-3.5"
            >
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
                placeholder={
                  parentId
                    ? "e.g. Meet in the middle"
                    : "e.g. Dynamic programming"
                }
                aria-label="Folder name"
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAdding(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!name.trim() || create.isPending}
                >
                  Create
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-[148px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card hover:text-primary"
            >
              <FolderPlus className="size-5" />
              {parentId ? `New folder in ${parentName}` : "New topic"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

type FolderView = "grid" | "tree";
const FOLDER_VIEW_KEY = "devspace.folderView";
function readFolderView(): FolderView {
  try {
    return localStorage.getItem(FOLDER_VIEW_KEY) === "tree" ? "tree" : "grid";
  } catch {
    return "grid";
  }
}

function summary(items: number, folders: number) {
  const parts: string[] = [];
  if (folders) parts.push(`${folders} folder${folders === 1 ? "" : "s"}`);
  if (items) parts.push(`${items} item${items === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : "Empty";
}

/** Every folder below `parentId` as an indented outline, so the whole structure is visible at once. */
function FolderOutline({
  parentId,
  childrenOf,
  count,
  onOpen,
  depth,
}: {
  parentId: string | null;
  childrenOf: Map<string | null, Folder[]>;
  count: Map<string, number>;
  onOpen: (id: string) => void;
  depth: number;
}) {
  const list = childrenOf.get(parentId) ?? [];
  if (!list.length) return null;
  return (
    <ul
      className={cn(depth > 0 && "ml-[22px] border-l border-border/70 pl-1.5")}
    >
      {list.map((f) => {
        const subs = childrenOf.get(f.id) ?? [];
        const n = count.get(f.id) ?? 0;
        return (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onOpen(f.id)}
              className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-accent/60"
            >
              {subs.length ? (
                <FolderOpen className="size-4 shrink-0 text-primary/70" />
              ) : (
                <FolderIcon className="size-4 shrink-0 text-primary/50" />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  depth === 0 && "font-medium",
                )}
              >
                {f.name}
              </span>
              <span className="shrink-0 text-2xs text-muted-foreground tabular">
                {n ? n : ""}
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
            <FolderOutline
              parentId={f.id}
              childrenOf={childrenOf}
              count={count}
              onOpen={onOpen}
              depth={depth + 1}
            />
          </li>
        );
      })}
    </ul>
  );
}

function TopicSection({
  icon: Icon,
  title,
  count,
  loading,
  onAdd,
  addLabel,
  empty,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  loading: boolean;
  onAdd: () => void;
  addLabel: string;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border bg-card shadow-soft">
      <header className="flex min-h-11 items-center justify-between gap-2 border-b border-border/70 px-4 py-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
          <span className="flex size-6 items-center justify-center rounded-md bg-secondary text-primary">
            <Icon className="size-3.5" />
          </span>
          {title}
          {count ? (
            <span className="font-normal text-muted-foreground">{count}</span>
          ) : null}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-primary"
          onClick={onAdd}
        >
          <Plus /> {addLabel}
        </Button>
      </header>
      <div className="flex-1 p-1.5">
        {loading ? (
          <div className="p-3">
            <Spinner />
          </div>
        ) : count === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className={cn(
              "w-full rounded-lg px-3 py-5 text-center text-xs text-muted-foreground transition-colors hover:bg-accent/50",
            )}
          >
            {empty} <span className="font-medium text-primary">Add one</span>
          </button>
        ) : (
          <ul className="space-y-0.5">{children}</ul>
        )}
      </div>
    </section>
  );
}

