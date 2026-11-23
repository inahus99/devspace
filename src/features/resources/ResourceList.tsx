import { Library, Search, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  RESOURCE_STATUS_LABELS,
  RESOURCE_STATUSES,
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPES,
  type ResourceStatus,
  type ResourceType,
} from "@shared/constants";
import type { Resource, Workspace } from "@shared/types";
import { EnumSelect } from "@/components/common/fields";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useList, useWorkspaceMap } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { ResourceCard, ResourceGrid } from "./ResourceCard";

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
              <ResourceGrid>
                {g.rows.map((r) => (
                  <ResourceCard
                    key={r.id}
                    resource={r}
                    workspace={!workspaceId && !groupByWorkspace && r.workspaceId ? (wsMap.get(r.workspaceId) ?? null) : null}
                    highlighted={flash === r.id}
                  />
                ))}
              </ResourceGrid>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
