import { BookOpen, BookOpenText, ChevronDown, Code2, ExternalLink, FileText, PenLine, Plus, Shapes } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Link } from "react-router";
import type { DiagramSummary, Folder, Workspace } from "@shared/types";
import { Spinner } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BOOK_FILE_LABEL } from "@/features/books/bookFile";
import { NoteCreateDialog } from "@/features/notes/NoteCreateDialog";
import { SnippetDialog } from "@/features/snippets/SnippetDialog";
import { AddLinkForm } from "./AddLinkForm";
import { timeAgo } from "@/lib/dates";
import { useAttachments, useCreate, useList } from "@/lib/queries";
import { routes } from "@/lib/routes";

const card =
  "group overflow-hidden rounded-xl border bg-card shadow-soft transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-pop";

function SectionHead({ icon: Icon, title, action }: { icon: typeof BookOpen; title: string; action?: React.ReactNode }) {
  return (
    <div className="mt-10 mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Icon className="size-4 text-primary" /> {title}
      </h2>
      {action}
    </div>
  );
}

/** Creates a drawing in a folder (or a workspace's top level) and opens it. */
function useNewDrawing() {
  const create = useCreate("diagrams");
  const navigate = useNavigate();
  return {
    pending: create.isPending,
    make: (workspaceId: string, folderId?: string | null) =>
      create.mutate({ workspaceId, folderId: folderId ?? null, title: "Untitled drawing" }, { onSuccess: (d) => navigate(routes.diagram(d.id)) }),
  };
}

/** Freeform drawings (Excalidraw doodles and diagrams) across all folders. */
export function DrawingsSection({ folders, workspaces }: { folders: Folder[]; workspaces: Workspace[] }) {
  const drawings = useList("diagrams", { kind: "drawing" });
  const newDrawing = useNewDrawing();
  const list = [...(drawings.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <section>
      <SectionHead
        icon={Shapes}
        title="Drawings"
        action={
          workspaces.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8" disabled={newDrawing.pending}>
                  <Plus /> New drawing <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Create in</DropdownMenuLabel>
                {workspaces.map((w) => (
                  <DropdownMenuItem key={w.id} onSelect={() => newDrawing.make(w.id)}>
                    {w.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      />
      {drawings.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No drawings yet. Diagrams and doodles you make show up here.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((d) => (
            <DrawingCard key={d.id} d={d} where={folders.find((f) => f.id === d.folderId)?.name ?? workspaces.find((w) => w.id === d.workspaceId)?.name} />
          ))}
        </div>
      )}
    </section>
  );
}

function DrawingCard({ d, where }: { d: DiagramSummary; where?: string }) {
  return (
    <Link to={routes.diagram(d.id)} className={card}>
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden border-b bg-white">
        {d.preview ? <img src={d.preview} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /> : <Shapes className="size-8 text-primary/25" />}
      </div>
      <div className="px-3 py-2.5">
        <p className="truncate text-sm font-medium">{d.title || "Untitled"}</p>
        <p className="mt-0.5 truncate text-2xs text-muted-foreground">
          {where ? `${where} · ` : ""}edited {timeAgo(d.updatedAt)}
        </p>
      </div>
    </Link>
  );
}

/** Books with their PDF: open one to read it with a notebook beside it. */
export function BooksSection() {
  const books = useList("books");
  const pdfs = useAttachments({ label: BOOK_FILE_LABEL });
  const withPdf = new Set((pdfs.data ?? []).map((a) => a.bookId));
  const list = [...(books.data ?? [])].sort(
    (a, b) => Number(withPdf.has(b.id)) - Number(withPdf.has(a.id)) || Number(b.status === "reading") - Number(a.status === "reading") || b.updatedAt.localeCompare(a.updatedAt),
  );
  return (
    <section>
      <SectionHead icon={BookOpen} title="Books" />
      {books.isLoading || pdfs.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No books yet. Add them on DevSpace's Bookshelf, then upload the PDF to read here.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => {
            const has = withPdf.has(b.id);
            return (
              <Link key={b.id} to={routes.bookReader(b.id, { notes: has })} className={`${card} flex items-center gap-3 p-3`}>
                <span className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-brand-soft text-brand">
                  {b.coverUrl ? <img src={b.coverUrl} alt="" className="size-full object-cover" /> : <BookOpenText className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{b.title}</span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {b.author ? `${b.author} · ` : ""}
                    {has ? (b.totalPages ? `page ${b.currentPage} of ${b.totalPages}` : "PDF ready") : "No PDF yet"}
                  </span>
                </span>
                {has ? <PenLine className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" /> : null}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** A folder's drawings, from the notebook's header. */
export function FolderDrawingsMenu({ folder }: { folder: Folder }) {
  const drawings = useList("diagrams", { folderId: folder.id, kind: "drawing" });
  const newDrawing = useNewDrawing();
  const list = drawings.data ?? [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8">
          <Shapes /> Drawings{list.length ? ` (${list.length})` : ""} <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {list.map((d) => (
          <DropdownMenuItem key={d.id} asChild>
            <Link to={routes.diagram(d.id)} className="truncate">
              {d.title || "Untitled"}
            </Link>
          </DropdownMenuItem>
        ))}
        {list.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={() => newDrawing.make(folder.workspaceId, folder.id)} disabled={newDrawing.pending}>
          <Plus /> New drawing here
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// A folder's typed notes, code snippets and links (tabs beside its notebook)
// ---------------------------------------------------------------------------

function TabBody({ action, loading, empty, children }: { action: React.ReactNode; loading: boolean; empty: string | null; children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex justify-end">{action}</div>
        {loading ? <Spinner /> : empty ? <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p> : children}
      </div>
    </div>
  );
}

/** Where items live: a folder, or a workspace's top level (folderId null). */
export type Place = { workspaceId: string; folderId: string | null };
const scopeOf = (p: Place) => ({ workspaceId: p.workspaceId, folderId: p.folderId ?? "root" });

export function FolderNotes({ place }: { place: Place }) {
  const notes = useList("notes", scopeOf(place));
  const [open, setOpen] = useState(false);
  const list = [...(notes.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <TabBody
      loading={notes.isLoading}
      empty={list.length ? null : "No typed notes here yet."}
      action={
        <>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus /> New note
          </Button>
          <NoteCreateDialog open={open} onOpenChange={setOpen} defaults={{ workspaceId: place.workspaceId, folderId: place.folderId ?? undefined }} />
        </>
      }
    >
      <ul className="divide-y rounded-xl border bg-card shadow-soft">
        {list.map((n) => (
          <li key={n.id}>
            <Link to={routes.note(n.id)} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50">
              <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{n.title || "Untitled"}</span>
                {n.excerpt ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.excerpt}</span> : null}
              </span>
              <span className="shrink-0 text-2xs text-muted-foreground">{timeAgo(n.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </TabBody>
  );
}

export function FolderCode({ place }: { place: Place }) {
  const snippets = useList("snippets", scopeOf(place));
  const [open, setOpen] = useState(false);
  const list = [...(snippets.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <TabBody
      loading={snippets.isLoading}
      empty={list.length ? null : "No code snippets here yet."}
      action={
        <>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus /> New snippet
          </Button>
          <SnippetDialog open={open} onOpenChange={setOpen} defaults={{ workspaceId: place.workspaceId, folderId: place.folderId ?? undefined }} />
        </>
      }
    >
      <div className="space-y-3">
        {list.map((s) => (
          <Link key={s.id} to={routes.snippet(s.id)} className="block overflow-hidden rounded-xl border bg-card shadow-soft hover:border-primary/30">
            <span className="flex items-center justify-between gap-2 border-b px-4 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <Code2 className="size-4 shrink-0 text-primary" />
                <span className="truncate">{s.title}</span>
              </span>
              <span className="shrink-0 text-2xs text-muted-foreground">{s.language}</span>
            </span>
            <pre className="max-h-40 overflow-hidden bg-muted/40 px-4 py-3 font-mono text-xs leading-relaxed">{s.code.split("\n").slice(0, 10).join("\n")}</pre>
          </Link>
        ))}
      </div>
    </TabBody>
  );
}

export function FolderLinks({ place }: { place: Place }) {
  const links = useList("resources", scopeOf(place));
  const create = useCreate("resources");
  const list = [...(links.data ?? [])].sort((a, b) => a.title.localeCompare(b.title));
  return (
    <TabBody
      loading={links.isLoading}
      empty={null}
      action={
        <div className="w-full max-w-md">
          <AddLinkForm
            pending={create.isPending}
            onAdd={async (url) => {
              let title = url;
              try {
                title = new URL(url).hostname.replace(/^www\./, "");
              } catch {
                /* the server validates the address */
              }
              const r = await create.mutateAsync({ workspaceId: place.workspaceId, folderId: place.folderId, title, url }).catch(() => null);
              return !!r;
            }}
          />
        </div>
      }
    >
      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No links here yet. Paste one above.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-soft">
          {list.map((r) => (
            <li key={r.id}>
              <a href={r.url} target="_blank" rel="noreferrer noopener" className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50">
                <ExternalLink className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.url.replace(/^https?:\/\//, "")}</span>
                  {r.description ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{r.description}</span> : null}
                </span>
                <span className="shrink-0 text-2xs text-muted-foreground">{r.type}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </TabBody>
  );
}
