import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Ellipsis, ExternalLink, Pencil, Plus, StickyNote, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { RESOURCE_STATUS_LABELS, RESOURCE_STATUSES, RESOURCE_TYPE_LABELS } from "@shared/constants";
import type { Resource, Workspace } from "@shared/types";
import { hostOf, youtubeId } from "@shared/url";
import { confirm } from "@/components/common/ConfirmDialog";
import { TagList } from "@/components/common/fields";
import { InlineNoteEditor } from "@/components/common/InlineNoteEditor";
import { ResourceStatusPill } from "@/components/common/Pill";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { formatTimestamp } from "@/lib/dates";
import { useDelete, useUpdate } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { ResourceDialog } from "./ResourceDialog";
import { ResourceTypeIcon } from "./resourceMeta";

// ---------------------------------------------------------------------------
// Preview lookup: a link without one asks the server once, then the list refreshes.
// ---------------------------------------------------------------------------

const asked = new Set<string>();

function usePreviewLookup(r: Resource) {
  const qc = useQueryClient();
  useEffect(() => {
    if (r.previewFetchedAt || asked.has(r.id)) return;
    asked.add(r.id);
    void api
      .post(`/resources/${r.id}/preview`)
      .then(() => qc.invalidateQueries({ queryKey: ["resources", "list"] }))
      .catch(() => asked.delete(r.id));
  }, [r.id, r.previewFetchedAt, qc]);
}

/** A steady colour per site, for links whose page has no image. */
function hueOf(host: string) {
  let h = 0;
  for (const c of host) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** A small site icon that hides itself when the site doesn't have one. */
export function SiteIcon({ src, className }: { src: string | null | undefined; className?: string }) {
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(true), [src]);
  if (!src || !ok) return null;
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setOk(false)} className={cn("shrink-0 rounded-sm object-contain", className)} />;
}

function PreviewMedia({ r }: { r: Resource }) {
  const yt = r.type === "youtube" ? youtubeId(r.url) : null;
  const src = r.previewImage ?? (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null);
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(true), [src]);
  const host = hostOf(r.url);

  if (src && ok) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setOk(false)}
        className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
    );
  }
  // No picture: the site's icon on a tint of its own colour.
  const hue = hueOf(host);
  return (
    <div
      className="flex size-full flex-col items-center justify-center gap-2"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 92% / .9), hsl(${(hue + 40) % 360} 50% 85% / .9))` }}
    >
      <span className="flex size-12 items-center justify-center rounded-xl bg-white/80 shadow-sm">
        {r.faviconUrl ? <FaviconOrType r={r} /> : <ResourceTypeIcon type={r.type} className="size-8 bg-transparent" />}
      </span>
      <span className="max-w-[85%] truncate text-xs font-medium text-neutral-700">{r.siteName ?? host}</span>
    </div>
  );
}

function FaviconOrType({ r }: { r: Resource }) {
  const [ok, setOk] = useState(true);
  return ok ? (
    <img src={r.faviconUrl!} alt="" referrerPolicy="no-referrer" onError={() => setOk(false)} className="size-7 object-contain" />
  ) : (
    <ResourceTypeIcon type={r.type} className="size-8 bg-transparent" />
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export function ResourceCard({
  resource: r,
  workspace,
  highlighted = false,
}: {
  resource: Resource;
  /** Shown as a label; leave out inside a workspace. */
  workspace?: Workspace | null;
  highlighted?: boolean;
}) {
  usePreviewLookup(r);
  const update = useUpdate("resources");
  const del = useDelete("resources");
  const openCapture = useUi((s) => s.openCapture);
  const [editing, setEditing] = useState(false);
  const [noting, setNoting] = useState(false);
  const host = hostOf(r.url);
  const loadingPreview = !r.previewFetchedAt;
  // Don't repeat the page's own title as its summary.
  const summary = r.previewDescription && r.previewDescription !== r.title ? r.previewDescription : null;

  const remove = async () => {
    if (await confirm({ title: `Delete “${r.title}”?`, description: "It will be removed from the library and its workspace.", destructive: true })) {
      del.mutate(r.id);
    }
  };

  return (
    <article
      id={`resource-${r.id}`}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-soft transition-[border-color,box-shadow] hover:border-primary/25 hover:shadow-pop",
        highlighted && "ring-2 ring-primary/50",
      )}
    >
      <a href={r.url} target="_blank" rel="noreferrer noopener" className="relative block aspect-[1.91/1] overflow-hidden border-b bg-muted" tabIndex={-1} aria-hidden>
        {loadingPreview && !r.previewImage ? <div className="size-full animate-pulse bg-muted" /> : <PreviewMedia r={r} />}
        <span className="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {RESOURCE_TYPE_LABELS[r.type]}
        </span>
      </a>

      <div className="flex min-h-0 flex-1 flex-col px-3.5 pt-3 pb-2.5">
        <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <SiteIcon src={r.faviconUrl} className="size-3.5" />
          <span className="truncate">{r.siteName ?? host}</span>
          {workspace ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex shrink-0 items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: workspace.color }} />
                {workspace.name}
              </span>
            </>
          ) : null}
        </div>

        <a href={r.url} target="_blank" rel="noreferrer noopener" className="mt-1 line-clamp-2 text-sm leading-snug font-semibold hover:text-primary" title={r.title}>
          {r.title}
        </a>
        {summary ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{summary}</p> : null}
        <TagList tags={r.tags} className="mt-2" />

        {/* Your own note on the link: why it's useful, what to read in it. */}
        <div className="mt-2.5">
          {noting ? (
            <InlineNoteEditor
              initial={r.description}
              allowEmpty
              maxLength={5000}
              pending={update.isPending}
              placeholder="Why it's useful, which part to read, what you took from it…"
              onCancel={() => setNoting(false)}
              onSave={async (description) => {
                const ok = await update.mutateAsync({ id: r.id, description }).then(
                  () => true,
                  () => false,
                );
                if (ok) setNoting(false);
              }}
            />
          ) : r.description ? (
            <button
              type="button"
              onClick={() => setNoting(true)}
              title="Edit your note"
              className="group/note flex w-full gap-2 rounded-lg border border-warning/25 bg-warning/8 px-2.5 py-2 text-left hover:border-warning/45"
            >
              <StickyNote className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span className="line-clamp-4 flex-1 text-xs leading-relaxed whitespace-pre-wrap">{r.description}</span>
              <Pencil className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 group-hover/note:opacity-100" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setNoting(true)}
              className="flex items-center gap-1 rounded-md text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" /> Add a note
            </button>
          )}
        </div>

        <div className="mt-auto flex items-center gap-1 pt-3">
          <span className="mr-auto truncate text-2xs text-muted-foreground" title={`Saved ${formatTimestamp(r.createdAt)}`}>
            {formatTimestamp(r.createdAt, "MMM d, yyyy")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rounded focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Status: ${RESOURCE_STATUS_LABELS[r.status]}. Change`}>
                <ResourceStatusPill status={r.status} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Status</DropdownMenuLabel>
              {RESOURCE_STATUSES.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => s !== r.status && update.mutate({ id: r.id, status: s })}>
                  {RESOURCE_STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => update.mutate({ id: r.id, isFavorite: !r.isFavorite })}
            aria-label={r.isFavorite ? "Remove from favourites" : "Add to favourites"}
            title={r.isFavorite ? "Remove from favourites" : "Add to favourites"}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Star className={cn("size-3.5", r.isFavorite ? "fill-warning text-warning" : "")} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="More actions">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={r.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink /> Open link
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNoting(true)}>
                <StickyNote /> {r.description ? "Edit note" : "Add a note"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil /> Edit details
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCapture("activity", { workspaceId: r.workspaceId ?? undefined, resourceId: r.id, title: r.title })}>
                <CalendarPlus /> Log activity
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {editing ? <ResourceDialog open onOpenChange={(o) => !o && setEditing(false)} resource={r} /> : null}
    </article>
  );
}

/** The cards in a responsive grid. */
export function ResourceGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}
