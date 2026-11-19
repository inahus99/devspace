import { Boxes, Plus, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { LLD_STATUS_LABELS, LLD_STATUSES, type LldStatus, SOLID_PRINCIPLES } from "@shared/constants";
import type { LldExercise } from "@shared/types";
import { DifficultyPill, LldStatusPill } from "@/components/common/Pill";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { TagList } from "@/components/common/fields";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { timeAgo } from "@/lib/dates";
import { useList, useWorkspaceMap } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";

const ALL = "__all__";

export function LldList({ workspaceId, folderId }: { workspaceId?: string; folderId?: string | null }) {
  const openCapture = useUi((s) => s.openCapture);
  const { data, isLoading, error, refetch } = useList("lld", { workspaceId, folderId: folderId ?? undefined });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<LldStatus | typeof ALL>(ALL);

  const all = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of all) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [all]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((e) => {
      if (status !== ALL && e.status !== status) return false;
      if (term && !`${e.title} ${e.problemStatement} ${e.designPatterns.join(" ")} ${e.tags.join(" ")}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [all, q, status]);

  const create = () => openCapture("lld", { workspaceId, folderId });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises, patterns, tags…" className="h-8 pl-8" aria-label="Search exercises" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as LldStatus | typeof ALL)}>
          <SelectTrigger size="sm" className="h-8 w-[170px]" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses · {all.length}</SelectItem>
            {LLD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {LLD_STATUS_LABELS[s]} · {counts[s] ?? 0}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={create} className="ml-auto">
          <Plus /> New exercise
        </Button>
      </div>

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No design exercises yet"
          description="Keep a complete record of every low-level design you study: requirements, class diagrams, patterns, code and trade-offs."
          action={
            <Button size="sm" onClick={create}>
              <Plus /> Start a design exercise
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matching exercises" description="Try a different search or status." compact />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => (
            <LldCard key={e.id} exercise={e} showWorkspace={!workspaceId} />
          ))}
        </div>
      )}
    </div>
  );
}

function LldCard({ exercise: e, showWorkspace }: { exercise: LldExercise; showWorkspace: boolean }) {
  const ws = useWorkspaceMap().get(e.workspaceId);
  const summary = e.problemStatement.replace(/[#*_`>[\]()-]/g, " ").replace(/\s+/g, " ").trim();
  return (
    <Link
      to={routes.lld(e.id)}
      className="group flex flex-col gap-2 rounded-xl border bg-card shadow-soft p-4 transition-colors hover:border-foreground/15 hover:bg-accent/30"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 font-medium leading-snug">{e.title}</h3>
        {e.isFavorite ? <Star className="mt-0.5 size-3.5 shrink-0 fill-warning text-warning" /> : null}
      </div>
      <p className={cn("line-clamp-2 text-xs text-muted-foreground", !summary && "italic")}>{summary || "No problem statement yet"}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <LldStatusPill status={e.status} />
        {e.difficulty ? <DifficultyPill difficulty={e.difficulty} /> : null}
        {SOLID_PRINCIPLES.filter((p) => e.solidPrinciples.includes(p.id)).map((p) => (
          <span key={p.id} title={p.label} className="inline-flex size-5 items-center justify-center rounded bg-brand-soft text-2xs font-semibold text-brand">
            {p.id}
          </span>
        ))}
      </div>
      {e.designPatterns.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {e.designPatterns.slice(0, 4).map((p) => (
            <span key={p} className="rounded border px-1.5 py-0.5 text-2xs text-muted-foreground">
              {p}
            </span>
          ))}
          {e.designPatterns.length > 4 ? <span className="px-1 text-2xs text-muted-foreground">+{e.designPatterns.length - 4}</span> : null}
        </div>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-2xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          {showWorkspace && ws ? (
            <>
              <WorkspaceIcon icon={ws.icon} color={ws.color} size="sm" className="size-3.5" />
              <span className="truncate">{ws.name}</span>
            </>
          ) : (
            <TagList tags={e.tags.slice(0, 3)} />
          )}
        </span>
        <span className="shrink-0">Updated {timeAgo(e.updatedAt)}</span>
      </div>
    </Link>
  );
}
