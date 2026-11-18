import { Code2, Plus, Search, Star } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { LANGUAGES, languageLabel } from "@shared/constants";
import { TagList } from "@/components/common/fields";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { CopyButton } from "@/components/editor/CodeEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { timeAgo } from "@/lib/dates";
import { useList, useWorkspaceFolders } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { useUi } from "@/stores/ui";

export function SnippetsList({ workspaceId, folderId }: { workspaceId: string; folderId?: string | null }) {
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState("all");
  const [sort, setSort] = useState("updated");
  const [favorite, setFavorite] = useState(false);
  const openCapture = useUi((s) => s.openCapture);
  const folders = useWorkspaceFolders(workspaceId);
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const { data, isLoading, error, refetch } = useList("snippets", {
    workspaceId,
    folderId: folderId ?? undefined,
    q: q || undefined,
    language: language === "all" ? undefined : language,
    sort,
    order: sort === "title" ? "asc" : "desc",
    favorite: favorite ? "1" : undefined,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles and code…" className="h-8 pl-8" />
        </div>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All languages</SelectItem>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Last updated</SelectItem>
            <SelectItem value="created">Date created</SelectItem>
            <SelectItem value="title">Title</SelectItem>
            <SelectItem value="language">Language</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={favorite ? "secondary" : "ghost"} size="sm" onClick={() => setFavorite(!favorite)} aria-pressed={favorite}>
          <Star className={favorite ? "fill-warning text-warning" : ""} /> Favourites
        </Button>
        <Button size="sm" onClick={() => openCapture("snippet", { workspaceId, folderId })}>
          <Plus /> New snippet
        </Button>
      </div>
      {isLoading ? (
        <LoadingRows />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState
          icon={Code2}
          title={q || language !== "all" || favorite ? "No matching snippets" : "No snippets yet"}
          description="Save reusable code — templates, patterns, one-liners — with syntax highlighting."
          action={
            <Button size="sm" variant="outline" onClick={() => openCapture("snippet", { workspaceId, folderId })}>
              <Plus /> New snippet
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((s) => (
            <article key={s.id} className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-foreground/20">
              <Link to={routes.snippet(s.id)} className="flex-1 px-4 pt-3 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-sm font-medium">{s.title}</h3>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">{languageLabel(s.language)}</span>
                </div>
                {s.description ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{s.description}</p> : null}
                <pre className="mt-2 max-h-28 overflow-hidden rounded-md bg-muted/50 p-2.5 font-mono text-[11.5px] leading-[1.55] text-muted-foreground">
                  {s.code.split("\n").slice(0, 6).join("\n") || "// empty"}
                </pre>
              </Link>
              <footer className="flex items-center justify-between gap-2 border-t px-4 py-1.5 text-2xs text-muted-foreground">
                <div className="flex min-w-0 items-center gap-2">
                  {s.isFavorite ? <Star className="size-3 fill-warning text-warning" /> : null}
                  {s.folderId && !folderId ? <span className="truncate">{folderName.get(s.folderId)}</span> : null}
                  <TagList tags={s.tags.slice(0, 3)} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span>{timeAgo(s.updatedAt)}</span>
                  <CopyButton text={s.code} className="opacity-0 group-hover:opacity-100 focus:opacity-100" />
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
