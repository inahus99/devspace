import { CalendarPlus, Ellipsis, ExternalLink, Library, Pencil, Search, Star, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  RESOURCE_STATUS_LABELS,
  RESOURCE_STATUSES,
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPES,
  type ResourceStatus,
  type ResourceType,
} from "@shared/constants";
import type { Resource, Workspace } from "@shared/types";
import { hostOf, youtubeId } from "@shared/url";
import { confirm } from "@/components/common/ConfirmDialog";
import { EnumSelect, TagList } from "@/components/common/fields";
import { ResourceStatusPill } from "@/components/common/Pill";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatTimestamp } from "@/lib/dates";
import { useDelete, useList, useUpdate, useWorkspaceMap } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { ResourceDialog } from "./ResourceDialog";
import { ResourceTypeIcon } from "./resourceMeta";

type SortKey = "created" | "title" | "status";
const SORT_LABELS: Record<SortKey, string> = { created: "Date added", title: "Title", status: "Status" };

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ResourceList({
  workspaceId,
  folderId,
  highlightId,
  groupByWorkspace,
}: {
  workspaceId?: string;
  folderId?: string | null;
  highlightId?: string;
  groupByWorkspace?: boolean;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<ResourceType | null>(null);
  const [status, setStatus] = useState<ResourceStatus | null>(null);
  const [favorites, setFavorites] = useState(false);
  const [sort, setSort] = useState<SortKey>("created");
  const [editing, setEditing] = useState<Resource | null>(null);
  const [flash, setFlash] = useState<string | undefined>(highlightId);
  const query = useDebounced(q);
  const wsMap = useWorkspaceMap();
  const openCapture = useUi((s) => s.openCapture);

  const { data, isLoading, error, refetch } = useList("resources", {
    workspaceId,
    folderId: folderId ?? undefined,
    q: query || undefined,
    type: type ?? undefined,
    status: status ?? undefined,
    favorite: favorites ? 1 : undefined,
    sort,
    order: sort === "created" ? "desc" : "asc",
  });

  // Scroll to and briefly highlight a resource linked from search / activities.
  useEffect(() => {
    if (!highlightId || !data?.some((r) => r.id === highlightId)) return;
    setFlash(highlightId);
    requestAnimationFrame(() => document.getElementById(`resource-${highlightId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
    const t = setTimeout(() => setFlash(undefined), 2400);
    return () => clearTimeout(t);
  }, [highlightId, data]);

  const groups = useMemo(() => {
    const rows = data ?? [];
    if (!groupByWorkspace || workspaceId) return [{ key: "all", workspace: null as Workspace | null, rows }];
    const map = new Map<string, Resource[]>();
    for (const r of rows) {
      const k = r.workspaceId ?? "none";
      const list = map.get(k) ?? [];
      list.push(r);
      map.set(k, list);
    }
    return [...map.entries()]
      .map(([key, list]) => ({ key, workspace: key === "none" ? null : (wsMap.get(key) ?? null), rows: list }))
      .sort((a, b) => (a.workspace?.position ?? 1e9) - (b.workspace?.position ?? 1e9));
  }, [data, groupByWorkspace, workspaceId, wsMap]);

  const filtersActive = !!(query || type || status || favorites);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, URL, description…" className="h-8 pl-8" aria-label="Search resources" />
        </div>
        <EnumSelect size="sm" className="h-8 w-[140px]" value={type} options={RESOURCE_TYPES} labels={RESOURCE_TYPE_LABELS} allowNone noneLabel="All types" onChange={setType} />
        <EnumSelect size="sm" className="h-8 w-[140px]" value={status} options={RESOURCE_STATUSES} labels={RESOURCE_STATUS_LABELS} allowNone noneLabel="Any status" onChange={setStatus} />
        <EnumSelect size="sm" className="h-8 w-[130px]" value={sort} options={["created", "title", "status"] as const} labels={SORT_LABELS} onChange={(v) => v && setSort(v)} />
        <Button size="sm" variant={favorites ? "secondary" : "ghost"} onClick={() => setFavorites((f) => !f)} aria-pressed={favorites}>
          <Star className={cn(favorites && "fill-current text-warning")} /> Favourites
        </Button>
      </div>

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState
          icon={Library}
          title={filtersActive ? "No matching resources" : "No resources yet"}
          description={filtersActive ? "Try clearing a filter or searching for something else." : "Save videos, docs, repos, posts and articles you learn from."}
          action={
            filtersActive ? undefined : (
              <Button size="sm" onClick={() => openCapture("resource", { workspaceId, folderId })}>
                Add resource
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key} className="space-y-1.5">
              {groups.length > 1 || (groupByWorkspace && !workspaceId) ? (
                <div className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                  {g.workspace ? <WorkspaceIcon icon={g.workspace.icon} color={g.workspace.color} size="sm" /> : null}
                  {g.workspace?.name ?? "Library only"}
                  <span className="font-normal">{g.rows.length}</span>
                </div>
              ) : null}
              <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
                {g.rows.map((r) => (
                  <ResourceRow
                    key={r.id}
                    resource={r}
                    workspace={!workspaceId && !groupByWorkspace && r.workspaceId ? (wsMap.get(r.workspaceId) ?? null) : null}
                    highlighted={flash === r.id}
                    onEdit={() => setEditing(r)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <ResourceDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} resource={editing ?? undefined} />
    </div>
  );
}

function ResourceRow({
  resource: r,
  workspace,
  highlighted,
  onEdit,
}: {
  resource: Resource;
  workspace: Workspace | null;
  highlighted: boolean;
  onEdit: () => void;
}) {
  const update = useUpdate("resources");
  const del = useDelete("resources");
  const openCapture = useUi((s) => s.openCapture);
  const yt = r.type === "youtube" ? youtubeId(r.url) : null;
  const [thumbOk, setThumbOk] = useState(true);

  const remove = async () => {
    if (await confirm({ title: `Delete “${r.title}”?`, description: "It will be removed from the library and its workspace.", destructive: true })) {
      del.mutate(r.id);
    }
  };

  return (
    <li
      id={`resource-${r.id}`}
      className={cn("group flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40", highlighted && "bg-brand-soft")}
    >
      {yt && thumbOk ? (
        <img
          src={`https://i.ytimg.com/vi/${yt}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          onError={() => setThumbOk(false)}
          className="mt-0.5 hidden h-[42px] w-[75px] shrink-0 rounded border object-cover sm:block"
        />
      ) : (
        <ResourceTypeIcon type={r.type} className="mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <a href={r.url} target="_blank" rel="noreferrer noopener" className="truncate text-sm font-medium hover:underline" title={r.title}>
            {r.title}
          </a>
          <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{RESOURCE_TYPE_LABELS[r.type]}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{hostOf(r.url)}</span>
          {workspace ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: workspace.color }} />
                {workspace.name}
              </span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span title={formatTimestamp(r.createdAt)}>{formatTimestamp(r.createdAt, "MMM d, yyyy")}</span>
        </div>
        {r.description ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description}</p> : null}
        <TagList tags={r.tags} className="mt-1.5" />
      </div>
      <div className="flex shrink-0 items-center gap-1">
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
        <IconAction label={r.isFavorite ? "Remove from favourites" : "Add to favourites"} onClick={() => update.mutate({ id: r.id, isFavorite: !r.isFavorite })}>
          <Star className={cn("size-3.5", r.isFavorite ? "fill-warning text-warning" : "")} />
        </IconAction>
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
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => openCapture("activity", { workspaceId: r.workspaceId ?? undefined, resourceId: r.id, title: r.title })}
            >
              <CalendarPlus /> Log activity
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
