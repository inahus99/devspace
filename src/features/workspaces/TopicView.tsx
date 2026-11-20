import {
  BookOpen,
  Boxes,
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  FolderTree,
  HelpCircle,
  LayoutGrid,
  NotebookPen,
  Link2,
  type LucideIcon,
  PenTool,
  Plus,
  Star,
} from "lucide-react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { DiagramSummary, Folder, Workspace } from "@shared/types";
import { AttachmentsPanel } from "@/components/common/Attachments";
import {
  BookStatusPill,
  DifficultyPill,
  DsaStatusPill,
  LldStatusPill,
} from "@/components/common/Pill";
import { Spinner } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourceTypeIcon } from "@/features/resources/resourceMeta";
import { timeAgo } from "@/lib/dates";
import {
  useAttachments,
  useCreate,
  useCreateFolder,
  useList,
} from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { CaptureKind } from "@/stores/ui";

/**
 * A topic page for a workspace or folder, laid out like a study notebook:
 * sub-topics as cards (e.g. one folder per DP pattern, or per HLD chapter), then the pages,
 * scans and screenshots, notes, links and kind-specific sections that live directly here.
 *
 * Sections follow the workspace kind: DSA gets pseudocode and questions, LLD gets code and
 * design exercises, a general workspace (HLD, system design, ...) gets books on its main page.
 * Any section that already has items in this folder is always shown.
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
  const notes = useList("notes", scope);
  const snippets = useList("snippets", scope);
  const resources = useList("resources", scope);
  const questions = useList("dsa", scope);
  const exercises = useList("lld", scope);
  const books = useList("books", scope, { enabled: !folder });
  const diagrams = useList("diagrams", scope);
  const files = useAttachments({ ...scope, standalone: "1" });

  const children = folders
    .filter((f) => f.parentId === here)
    .sort((a, b) => a.position - b.position);
  const inHere = <T extends { folderId: string | null }>(
    rows: T[] | undefined,
  ) => (rows ?? []).filter((r) => r.folderId === here);

  const cardInfo = useMemo(() => {
    const count = new Map<string, number>();
    const bump = (rows: { folderId: string | null }[] | undefined) => {
      for (const r of rows ?? [])
        if (r.folderId) count.set(r.folderId, (count.get(r.folderId) ?? 0) + 1);
    };
    for (const rows of [
      notes.data,
      snippets.data,
      resources.data,
      questions.data,
      exercises.data,
      files.data,
      diagrams.data,
    ])
      bump(rows);
    const cover = new Map<string, string>();
    for (const a of files.data ?? [])
      if (a.kind === "image" && a.folderId && !cover.has(a.folderId))
        cover.set(a.folderId, a.url);
    for (const d of diagrams.data ?? [])
      if (d.preview && d.folderId && !cover.has(d.folderId))
        cover.set(d.folderId, d.preview);
    return { count, cover };
  }, [
    notes.data,
    snippets.data,
    resources.data,
    questions.data,
    exercises.data,
    files.data,
    diagrams.data,
  ]);

  const hereNotes = inHere(notes.data);
  const hereSnippets = inHere(snippets.data);
  const hereResources = inHere(resources.data);
  const hereQuestions = inHere(questions.data);
  const hereExercises = inHere(exercises.data);
  const wsBooks = folder ? [] : (books.data ?? []);
  const title = folder?.name ?? workspace.name;

  const showCode = kind !== "general" || hereSnippets.length > 0;
  const showQuestions = kind === "dsa" || hereQuestions.length > 0;
  const showExercises = kind === "lld" || hereExercises.length > 0;
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
  sections.push(
    <TopicSection
      key="notes"
      icon={FileText}
      title="Notes"
      count={hereNotes.length}
      loading={notes.isLoading}
      onAdd={() => capture("note")}
      addLabel="Note"
      empty={
        kind === "dsa"
          ? "Intuition, explanations, edge cases."
          : "Your own notes, summaries and takeaways."
      }
    >
      {hereNotes.map((n) => (
        <Row
          key={n.id}
          to={routes.note(n.id)}
          title={n.title || "Untitled"}
          meta={`Edited ${timeAgo(n.updatedAt)}`}
        />
      ))}
    </TopicSection>,
  );
  if (showCode)
    sections.push(
      <TopicSection
        key="code"
        icon={Code2}
        title={kind === "dsa" ? "Pseudocode & code" : "Code"}
        count={hereSnippets.length}
        loading={snippets.isLoading}
        onAdd={() => capture("snippet")}
        addLabel="Snippet"
        empty="Templates and snippets you can reuse."
      >
        {hereSnippets.map((s) => (
          <li key={s.id}>
            <Link
              to={routes.snippet(s.id)}
              className="block rounded-lg px-3 py-2 transition-colors hover:bg-accent/60"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {s.title || "Untitled"}
                </span>
                <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
                  {s.language}
                </span>
              </span>
              {s.code ? (
                <pre className="mt-1.5 line-clamp-4 overflow-hidden rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-[11.5px] leading-5 whitespace-pre-wrap text-muted-foreground">
                  {s.code}
                </pre>
              ) : null}
            </Link>
          </li>
        ))}
      </TopicSection>,
    );
  if (showExercises)
    sections.push(
      <TopicSection
        key="lld"
        icon={Boxes}
        title="Design exercises"
        count={hereExercises.length}
        loading={exercises.isLoading}
        onAdd={() => capture("lld")}
        addLabel="Exercise"
        empty="Design problems to work through."
      >
        {hereExercises.map((x) => (
          <li key={x.id}>
            <Link
              to={routes.lld(x.id)}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent/60"
            >
              <span className="truncate text-sm">{x.title}</span>
              <LldStatusPill status={x.status} />
            </Link>
          </li>
        ))}
      </TopicSection>,
    );
  sections.push(
    <TopicSection
      key="links"
      icon={Link2}
      title="Links"
      count={hereResources.length}
      loading={resources.isLoading}
      onAdd={() => capture("resource")}
      addLabel="Link"
      empty="Articles, videos, talks, docs."
    >
      {hereResources.map((r) => (
        <li
          key={r.id}
          className="group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/60"
        >
          <ResourceTypeIcon type={r.type} className="size-4 shrink-0" />
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer noopener"
            className="min-w-0 flex-1"
          >
            <span className="block truncate text-sm">{r.title}</span>
            <span className="block truncate text-2xs text-muted-foreground">
              {hostOf(r.url)}
            </span>
          </a>
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </li>
      ))}
    </TopicSection>,
  );
  if (showQuestions)
    sections.push(
      <TopicSection
        key="questions"
        icon={HelpCircle}
        title="Questions"
        count={hereQuestions.length}
        loading={questions.isLoading}
        onAdd={() => capture("dsa")}
        addLabel="Question"
        empty="Problems that use this pattern."
      >
        {hereQuestions.map((q) => (
          <li
            key={q.id}
            className="group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/60"
          >
            <Link to={routes.dsa(q.id)} className="min-w-0 flex-1">
              <span className="block truncate text-sm">{q.title}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
                {q.platform || "Problem"}
                {q.topic ? ` · ${q.topic}` : ""}
              </span>
            </Link>
            <DifficultyPill difficulty={q.difficulty} />
            {q.status !== "todo" ? <DsaStatusPill status={q.status} /> : null}
            {q.url ? (
              <a
                href={q.url}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={`Open ${q.title}`}
              >
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </li>
        ))}
      </TopicSection>,
    );

  return (
    <div className="space-y-6">
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

      <AttachmentsPanel
        target={{ workspaceId: workspace.id, folderId: here }}
        query={{ workspaceId: workspace.id, folderId: here ?? "root" }}
        standalone
        gallery
        title={
          kind === "dsa"
            ? "Overview & screenshots"
            : "Pages, scans & screenshots"
        }
        emptyHint={
          kind === "dsa"
            ? children.length
              ? `Paste a screenshot (Ctrl+V), drop an image, or upload, e.g. a cheat sheet of every ${title} pattern.`
              : "Paste a screenshot (Ctrl+V), drop an image, or upload: diagrams, dry runs, whiteboard photos."
            : "Photos of handwritten pages, scanned PDFs, diagrams or screenshots. Paste (Ctrl+V), drop, or upload; on a phone, Upload can open the camera."
        }
      />

      <DiagramsSection
        workspaceId={workspace.id}
        folderId={here}
        diagrams={inHere(diagrams.data)}
        loading={diagrams.isLoading}
      />

      {/* An odd last section spans the full width so the grid never ends on a half-empty row. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
        {sections}
      </div>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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

/** Excalidraw sketches that live in this folder, as a thumbnail grid. */
function DiagramsSection({
  workspaceId,
  folderId,
  diagrams,
  loading,
}: {
  workspaceId: string;
  folderId: string | null;
  diagrams: DiagramSummary[];
  loading: boolean;
}) {
  const create = useCreate("diagrams");
  const navigate = useNavigate();
  const sorted = [...diagrams].sort(
    (a, b) =>
      Number(b.isFavorite) - Number(a.isFavorite) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
  const newDiagram = () =>
    create.mutate(
      { workspaceId, folderId, title: "Untitled diagram" },
      { onSuccess: (d) => navigate(routes.diagram(d.id)) },
    );
  // A notebook is a drawing that starts on an A4 page; it saves as a multi-page PDF.
  const newNotebook = () =>
    create.mutate(
      { workspaceId, folderId, title: "Untitled notebook" },
      { onSuccess: (d) => navigate(`${routes.diagram(d.id)}?notebook=1`) },
    );

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <header className="flex min-h-11 items-center justify-between gap-2 border-b border-border/70 px-4 py-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
          <span className="flex size-6 items-center justify-center rounded-md bg-secondary text-primary">
            <PenTool className="size-3.5" />
          </span>
          Diagrams & notebooks
          {diagrams.length ? (
            <span className="font-normal text-muted-foreground">
              {diagrams.length}
            </span>
          ) : null}
        </h3>
        <div className="flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-primary"
            onClick={newNotebook}
            disabled={create.isPending}
          >
            <NotebookPen /> Notebook
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-primary"
            onClick={newDiagram}
            disabled={create.isPending}
          >
            <Plus /> Diagram
          </Button>
        </div>
      </header>
      <div className="p-3">
        {loading ? (
          <Spinner />
        ) : sorted.length === 0 ? (
          <button
            type="button"
            onClick={newDiagram}
            disabled={create.isPending}
            className="w-full rounded-lg px-3 py-5 text-center text-xs text-muted-foreground transition-colors hover:bg-accent/50"
          >
            Sketch architectures and flows, or handwrite notes on A4 pages
            with a pen and save them as PDF.{" "}
            <span className="font-medium text-primary">Draw one</span>
          </button>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sorted.map((d) => (
              <Link
                key={d.id}
                to={d.kind === "board" && d.folderId ? routes.notebooks(d.folderId) : routes.diagram(d.id)}
                className="group overflow-hidden rounded-lg border bg-background transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-pop"
              >
                <div className="flex aspect-[16/10] items-center justify-center overflow-hidden border-b bg-white">
                  {d.preview ? (
                    <img
                      src={d.preview}
                      alt=""
                      loading="lazy"
                      className="size-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <PenTool className="size-6 text-primary/30" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {d.title}
                  </span>
                  {d.isFavorite ? (
                    <Star
                      className="size-3.5 shrink-0 fill-warning text-warning"
                      aria-label="Favourite"
                    />
                  ) : null}
                </div>
                <p className="-mt-1.5 px-3 pb-2 text-2xs text-muted-foreground">
                  Edited {timeAgo(d.updatedAt)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
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

function Row({ to, title, meta }: { to: string; title: string; meta: string }) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent/60"
      >
        <span className="truncate text-sm">{title}</span>
        <span className="shrink-0 text-2xs text-muted-foreground">{meta}</span>
      </Link>
    </li>
  );
}
