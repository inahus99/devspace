import { FileText, Hash, Plus, Search, Star } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { TagList } from "@/components/common/fields";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { timeAgo } from "@/lib/dates";
import { useList, useUpdate, useWorkspaceFolders } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";

export function NotesList({ workspaceId, folderId }: { workspaceId: string; folderId?: string | null }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("updated");
  const [favorite, setFavorite] = useState(false);
  const openCapture = useUi((s) => s.openCapture);
  const update = useUpdate("notes");
  const folders = useWorkspaceFolders(workspaceId);
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const { data, isLoading, error, refetch } = useList("notes", {
    workspaceId,
    folderId: folderId ?? undefined,
    q: q || undefined,
    sort,
    order: sort === "title" ? "asc" : "desc",
    favorite: favorite ? "1" : undefined,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes…" className="h-8 pl-8" />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Last edited</SelectItem>
            <SelectItem value="created">Date created</SelectItem>
            <SelectItem value="title">Title</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={favorite ? "secondary" : "ghost"} size="sm" onClick={() => setFavorite(!favorite)} aria-pressed={favorite}>
          <Star className={favorite ? "fill-warning text-warning" : ""} /> Favourites
        </Button>
        <Button size="sm" onClick={() => openCapture("note", { workspaceId, folderId })}>
          <Plus /> New note
        </Button>
      </div>
      {isLoading ? (
        <LoadingRows />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState
          icon={FileText}
          title={q || favorite ? "No matching notes" : folderId ? "This folder has no notes yet" : "No notes yet"}
          description="Capture what you learn — rich text or Markdown, with pasted screenshots, code blocks and checklists."
          action={
            <Button size="sm" variant="outline" onClick={() => openCapture("note", { workspaceId, folderId })}>
              <Plus /> New note
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-soft">
          {data.map((n) => (
            <li key={n.id} className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40">
              {n.format === "markdown" ? (
                <Hash className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <Link to={routes.note(n.id)} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{n.title || "Untitled"}</span>
                  {n.folderId && !folderId ? (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">{folderName.get(n.folderId)}</span>
                  ) : null}
                </div>
                {n.excerpt ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.excerpt}</p> : null}
                <TagList tags={n.tags} className="mt-1.5" />
              </Link>
              <div className="flex shrink-0 items-center gap-2 text-2xs text-muted-foreground">
                <span>{timeAgo(n.updatedAt)}</span>
                <button
                  type="button"
                  onClick={() => update.mutate({ id: n.id, isFavorite: !n.isFavorite })}
                  className={cn("rounded p-1 hover:bg-accent", !n.isFavorite && "opacity-0 group-hover:opacity-100 focus:opacity-100")}
                  aria-label={n.isFavorite ? "Remove from favourites" : "Add to favourites"}
                >
                  <Star className={cn("size-3.5", n.isFavorite && "fill-warning text-warning")} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
