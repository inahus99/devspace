import { BookOpen, Boxes, Code2, ExternalLink, FileText, Folder as FolderIcon, FolderPlus, HelpCircle, Link2, type LucideIcon, Plus } from "lucide-react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import type { Folder, Workspace } from "@shared/types";
import { AttachmentsPanel } from "@/components/common/Attachments";
import { BookStatusPill, DifficultyPill, DsaStatusPill, LldStatusPill } from "@/components/common/Pill";
import { Spinner } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourceTypeIcon } from "@/features/resources/resourceMeta";
import { timeAgo } from "@/lib/dates";
import { useAttachments, useCreateFolder, useList } from "@/lib/queries";
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
  const files = useAttachments({ ...scope, standalone: "1" });

  const children = folders.filter((f) => f.parentId === here).sort((a, b) => a.position - b.position);
  const inHere = <T extends { folderId: string | null }>(rows: T[] | undefined) => (rows ?? []).filter((r) => r.folderId === here);

  const cardInfo = useMemo(() => {
    const count = new Map<string, number>();
    const bump = (rows: { folderId: string | null }[] | undefined) => {
      for (const r of rows ?? []) if (r.folderId) count.set(r.folderId, (count.get(r.folderId) ?? 0) + 1);
    };
    for (const rows of [notes.data, snippets.data, resources.data, questions.data, exercises.data, files.data]) bump(rows);
    const cover = new Map<string, string>();
    for (const a of files.data ?? []) if (a.kind === "image" && a.folderId && !cover.has(a.folderId)) cover.set(a.folderId, a.url);
    return { count, cover };
  }, [notes.data, snippets.data, resources.data, questions.data, exercises.data, files.data]);

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
      <TopicSection key="books" icon={BookOpen} title="Books" count={wsBooks.length} loading={books.isLoading} onAdd={() => capture("book")} addLabel="Book" empty="The books you are reading for this subject.">
        {wsBooks.map((b) => {
          const pct = b.totalPages ? Math.round((b.currentPage / b.totalPages) * 100) : null;
          return (
            <li key={b.id}>
              <Link to={routes.book(b.id)} className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent/60">
                {b.coverUrl ? (
                  <img src={b.coverUrl} alt="" loading="lazy" className="h-12 w-9 shrink-0 rounded-sm border object-cover" />
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
    <TopicSection key="notes" icon={FileText} title="Notes" count={hereNotes.length} loading={notes.isLoading} onAdd={() => capture("note")} addLabel="Note" empty={kind === "dsa" ? "Intuition, explanations, edge cases." : "Your own notes, summaries and takeaways."}>
      {hereNotes.map((n) => (
        <Row key={n.id} to={routes.note(n.id)} title={n.title || "Untitled"} meta={`Edited ${timeAgo(n.updatedAt)}`} />
      ))}
    </TopicSection>,
  );
  if (showCode)
    sections.push(
      <TopicSection key="code" icon={Code2} title={kind === "dsa" ? "Pseudocode & code" : "Code"} count={hereSnippets.length} loading={snippets.isLoading} onAdd={() => capture("snippet")} addLabel="Snippet" empty="Templates and snippets you can reuse.">
        {hereSnippets.map((s) => (
          <li key={s.id}>
            <Link to={routes.snippet(s.id)} className="block rounded-lg px-3 py-2 transition-colors hover:bg-accent/60">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{s.title || "Untitled"}</span>
                <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">{s.language}</span>
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
      <TopicSection key="lld" icon={Boxes} title="Design exercises" count={hereExercises.length} loading={exercises.isLoading} onAdd={() => capture("lld")} addLabel="Exercise" empty="Design problems to work through.">
        {hereExercises.map((x) => (
          <li key={x.id}>
            <Link to={routes.lld(x.id)} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent/60">
              <span className="truncate text-sm">{x.title}</span>
              <LldStatusPill status={x.status} />
            </Link>
          </li>
        ))}
      </TopicSection>,
    );
  sections.push(
    <TopicSection key="links" icon={Link2} title="Links" count={hereResources.length} loading={resources.isLoading} onAdd={() => capture("resource")} addLabel="Link" empty="Articles, videos, talks, docs.">
      {hereResources.map((r) => (
        <li key={r.id} className="group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/60">
          <ResourceTypeIcon type={r.type} className="size-4 shrink-0" />
          <a href={r.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1">
            <span className="block truncate text-sm">{r.title}</span>
            <span className="block truncate text-2xs text-muted-foreground">{hostOf(r.url)}</span>
          </a>
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </li>
      ))}
    </TopicSection>,
  );
  if (showQuestions)
    sections.push(
      <TopicSection key="questions" icon={HelpCircle} title="Questions" count={hereQuestions.length} loading={questions.isLoading} onAdd={() => capture("dsa")} addLabel="Question" empty="Problems that use this pattern.">
        {hereQuestions.map((q) => (
          <li key={q.id} className="group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/60">
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
              <a href={q.url} target="_blank" rel="noreferrer noopener" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Open ${q.title}`}>
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
        count={cardInfo.count}
        cover={cardInfo.cover}
        onOpen={onOpenFolder}
      />

      <AttachmentsPanel
        target={{ workspaceId: workspace.id, folderId: here }}
        query={{ workspaceId: workspace.id, folderId: here ?? "root" }}
        standalone
        gallery
        title={kind === "dsa" ? "Overview & screenshots" : "Pages, scans & screenshots"}
        emptyHint={
          kind === "dsa"
            ? children.length
              ? `Paste a screenshot (Ctrl+V), drop an image, or upload, e.g. a cheat sheet of every ${title} pattern.`
              : "Paste a screenshot (Ctrl+V), drop an image, or upload: diagrams, dry runs, whiteboard photos."
            : "Photos of handwritten pages, scanned PDFs, diagrams or screenshots. Paste (Ctrl+V), drop, or upload; on a phone, Upload can open the camera."
        }
      />

      {/* An odd last section spans the full width so the grid never ends on a half-empty row. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">{sections}</div>
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
  count,
  cover,
  onOpen,
}: {
  workspaceId: string;
  parentId: string | null;
  parentName: string;
  folders: Folder[];
  count: Map<string, number>;
  cover: Map<string, string>;
  onOpen: (id: string) => void;
}) {
  const create = useCreateFolder();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    create.mutate({ workspaceId, parentId, name: n }, { onSuccess: () => (setName(""), setAdding(false)) });
  };

  // A leaf folder (e.g. one pattern) doesn't need a big empty grid, just a quiet way to nest further.
  if (parentId && folders.length === 0 && !adding) {
    return (
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setAdding(true)}>
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
          {folders.length ? <span className="ml-1.5 font-normal text-muted-foreground">{folders.length}</span> : null}
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {folders.map((f) => {
          const img = f.bannerUrl || cover.get(f.id);
          const n = count.get(f.id) ?? 0;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onOpen(f.id)}
              className="group overflow-hidden rounded-xl border bg-card text-left shadow-soft transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-pop"
            >
              <div className="relative h-24 overflow-hidden bg-secondary">
                {img ? (
                  <img src={img} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" style={f.bannerUrl ? { objectPosition: `50% ${f.bannerPosition}%` } : undefined} />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <FolderIcon className="size-7 text-primary/40" />
                  </div>
                )}
              </div>
              <div className="px-3.5 py-3">
                <p className="truncate text-sm font-medium">{f.name}</p>
                <p className="mt-0.5 text-2xs text-muted-foreground">{n === 0 ? "Empty" : `${n} item${n === 1 ? "" : "s"}`}</p>
              </div>
            </button>
          );
        })}

        {adding ? (
          <form onSubmit={submit} className="flex flex-col justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-card p-3.5">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
              placeholder={parentId ? "e.g. Meet in the middle" : "e.g. Dynamic programming"}
              aria-label="Folder name"
            />
            <div className="flex justify-end gap-1.5">
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
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
          {count ? <span className="font-normal text-muted-foreground">{count}</span> : null}
        </h3>
        <Button size="sm" variant="ghost" className="h-7 text-primary" onClick={onAdd}>
          <Plus /> {addLabel}
        </Button>
      </header>
      <div className="flex-1 p-1.5">
        {loading ? (
          <div className="p-3">
            <Spinner />
          </div>
        ) : count === 0 ? (
          <button type="button" onClick={onAdd} className={cn("w-full rounded-lg px-3 py-5 text-center text-xs text-muted-foreground transition-colors hover:bg-accent/50")}>
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
      <Link to={to} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent/60">
        <span className="truncate text-sm">{title}</span>
        <span className="shrink-0 text-2xs text-muted-foreground">{meta}</span>
      </Link>
    </li>
  );
}
