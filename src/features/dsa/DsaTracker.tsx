import { ArrowDownUp, Binary, CalendarClock, CheckCircle2, ExternalLink, Layers, ListTodo, Plus, RotateCcw, Search, Star, Table2, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  DSA_DIFFICULTIES,
  DSA_DIFFICULTY_LABELS,
  DSA_STATUS_LABELS,
  DSA_STATUSES,
  type DsaDifficulty,
  type DsaStatus,
} from "@shared/constants";
import type { DsaProblem } from "@shared/types";
import { DifficultyPill, DsaStatusPill } from "@/components/common/Pill";
import { EmptyState, ErrorState, LoadingRows, Stat } from "@/components/common/states";
import { TagList } from "@/components/common/fields";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { relativeDay, timeAgo, todayISO } from "@/lib/dates";
import { useList, useUpdate, useWorkspaceMap } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { DIFFICULTY_ORDER, MiniBar, MultiFilter, STATUS_ORDER } from "./shared";

type View = "table" | "topic" | "queue";
type SortKey = "updated" | "title" | "difficulty" | "status" | "solved" | "nextReview";

const SORT_LABELS: Record<SortKey, string> = {
  updated: "Last updated",
  title: "Title",
  difficulty: "Difficulty",
  status: "Status",
  solved: "Date solved",
  nextReview: "Next review",
};

const ALL_TOPICS = "__all__";

export function isDue(p: DsaProblem, today: string): boolean {
  return p.status === "needs_revision" || (!!p.nextReviewOn && p.nextReviewOn <= today);
}

function compare(a: DsaProblem, b: DsaProblem, key: SortKey): number {
  switch (key) {
    case "title":
      return a.title.localeCompare(b.title);
    case "difficulty":
      return DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty];
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    case "solved":
      return (a.solvedOn ?? "").localeCompare(b.solvedOn ?? "");
    case "nextReview":
      return (a.nextReviewOn ?? "9999").localeCompare(b.nextReviewOn ?? "9999");
    case "updated":
      return a.updatedAt.localeCompare(b.updatedAt);
  }
}

export function DsaTracker({ workspaceId, folderId }: { workspaceId?: string; folderId?: string | null }) {
  const openCapture = useUi((s) => s.openCapture);
  const today = todayISO();
  const month = today.slice(0, 7);
  const { data, isLoading, error, refetch } = useList("dsa", { workspaceId, folderId: folderId ?? undefined });

  const [view, setView] = useState<View>("table");
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<DsaStatus[]>([]);
  const [difficulties, setDifficulties] = useState<DsaDifficulty[]>([]);
  const [topic, setTopic] = useState<string>(ALL_TOPICS);
  const [sort, setSort] = useState<SortKey>("updated");
  const [desc, setDesc] = useState(true);

  const all = useMemo(() => data ?? [], [data]);

  const stats = useMemo(() => {
    const solved = all.filter((p) => p.status === "solved" || p.status === "mastered");
    const byDifficulty = Object.fromEntries(DSA_DIFFICULTIES.map((d) => [d, all.filter((p) => p.difficulty === d).length])) as Record<DsaDifficulty, number>;
    return {
      total: all.length,
      solved: solved.length,
      solvedThisMonth: solved.filter((p) => p.solvedOn?.startsWith(month)).length,
      due: all.filter((p) => isDue(p, today)).length,
      byDifficulty,
    };
  }, [all, month, today]);

  const topics = useMemo(() => [...new Set(all.map((p) => p.topic).filter(Boolean))].sort(), [all]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = all.filter((p) => {
      if (statuses.length && !statuses.includes(p.status)) return false;
      if (difficulties.length && !difficulties.includes(p.difficulty)) return false;
      if (topic !== ALL_TOPICS && p.topic !== topic) return false;
      if (term && !`${p.title} ${p.topic} ${p.platform} ${p.tags.join(" ")}`.toLowerCase().includes(term)) return false;
      return true;
    });
    if (view === "queue") {
      list = list.filter((p) => isDue(p, today)).sort((a, b) => (a.nextReviewOn ?? "").localeCompare(b.nextReviewOn ?? ""));
      return list;
    }
    list = [...list].sort((a, b) => compare(a, b, sort) * (desc ? -1 : 1));
    return list;
  }, [all, statuses, difficulties, topic, q, sort, desc, view, today]);

  const filtersActive = statuses.length > 0 || difficulties.length > 0 || topic !== ALL_TOPICS || q.trim() !== "";
  const newProblem = () => openCapture("dsa", { workspaceId, folderId });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Problems" value={stats.total} icon={Binary} />
        <Stat label="Solved" value={stats.solved} icon={CheckCircle2} hint={stats.total ? `${Math.round((stats.solved / stats.total) * 100)}% of all` : undefined} />
        <Stat label="Solved this month" value={stats.solvedThisMonth} icon={Target} />
        <Stat label="Due for revision" value={stats.due} icon={RotateCcw} />
        <div className="col-span-2 rounded-xl border bg-card shadow-soft px-4 py-3 lg:col-span-1">
          <div className="text-xs text-muted-foreground">Difficulty mix</div>
          <div className="mt-2 space-y-1.5">
            {DSA_DIFFICULTIES.map((d) => (
              <div key={d} className="flex items-center gap-2 text-2xs">
                <span className="w-12 text-muted-foreground">{DSA_DIFFICULTY_LABELS[d]}</span>
                <MiniBar
                  value={stats.byDifficulty[d]}
                  total={stats.total}
                  color={d === "easy" ? "var(--success)" : d === "medium" ? "var(--warning)" : "var(--destructive)"}
                />
                <span className="w-5 text-right tabular">{stats.byDifficulty[d]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as View)} variant="outline" size="sm">
          <ToggleGroupItem value="table" aria-label="Table view" className="gap-1.5 px-2.5">
            <Table2 className="size-3.5" /> Table
          </ToggleGroupItem>
          <ToggleGroupItem value="topic" aria-label="Group by topic" className="gap-1.5 px-2.5">
            <Layers className="size-3.5" /> By topic
          </ToggleGroupItem>
          <ToggleGroupItem value="queue" aria-label="Revision queue" className="gap-1.5 px-2.5">
            <ListTodo className="size-3.5" /> Revision
            {stats.due > 0 ? <span className="rounded bg-warning/20 px-1 text-2xs tabular">{stats.due}</span> : null}
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search problems, topics, tags…" className="h-8 pl-8" aria-label="Search problems" />
        </div>
        <MultiFilter label="Status" options={DSA_STATUSES} labels={DSA_STATUS_LABELS} value={statuses} onChange={setStatuses} />
        <MultiFilter label="Difficulty" options={DSA_DIFFICULTIES} labels={DSA_DIFFICULTY_LABELS} value={difficulties} onChange={setDifficulties} />
        <Select value={topic} onValueChange={setTopic}>
          <SelectTrigger size="sm" className="h-8 w-[150px]" aria-label="Topic">
            <SelectValue placeholder="Topic" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TOPICS}>All topics</SelectItem>
            {topics.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {view !== "queue" ? (
          <div className="flex items-center">
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger size="sm" className="h-8 w-[140px] rounded-r-none" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SORT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon-sm" className="-ml-px h-8 rounded-l-none" onClick={() => setDesc((d) => !d)} aria-label={desc ? "Descending" : "Ascending"} title={desc ? "Descending" : "Ascending"}>
              <ArrowDownUp className={cn("size-3.5 transition-transform", !desc && "rotate-180")} />
            </Button>
          </div>
        ) : null}
        <Button size="sm" onClick={newProblem} className="ml-auto">
          <Plus /> New problem
        </Button>
      </div>

      {isLoading ? (
        <LoadingRows rows={6} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Binary}
          title="No problems yet"
          description="Track every problem you attempt — approach, complexity, multiple solutions and a spaced revision queue."
          action={
            <Button size="sm" onClick={newProblem}>
              <Plus /> Add your first problem
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        view === "queue" && !filtersActive ? (
          <EmptyState icon={CalendarClock} title="Nothing due for revision" description="Problems marked “Needs revision” or past their review date show up here." compact />
        ) : (
          <EmptyState
            icon={Search}
            title="No matching problems"
            description="Try clearing some filters."
            compact
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setQ("");
                  setStatuses([]);
                  setDifficulties([]);
                  setTopic(ALL_TOPICS);
                }}
              >
                Clear filters
              </Button>
            }
          />
        )
      ) : view === "topic" ? (
        <TopicGroups problems={filtered} showWorkspace={!workspaceId} today={today} />
      ) : (
        <ProblemTable problems={filtered} showWorkspace={!workspaceId} today={today} queue={view === "queue"} />
      )}
    </div>
  );
}

function TopicGroups({ problems, showWorkspace, today }: { problems: DsaProblem[]; showWorkspace: boolean; today: string }) {
  const groups = useMemo(() => {
    const map = new Map<string, DsaProblem[]>();
    for (const p of problems) {
      const key = p.topic || "Uncategorised";
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [problems]);
  return (
    <div className="space-y-4">
      {groups.map(([topic, list]) => {
        const solved = list.filter((p) => p.status === "solved" || p.status === "mastered").length;
        return (
          <div key={topic} className="space-y-2">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium">{topic}</h3>
              <span className="text-xs text-muted-foreground tabular">
                {solved}/{list.length} solved
              </span>
              <MiniBar value={solved} total={list.length} className="max-w-40" />
            </div>
            <ProblemTable problems={list} showWorkspace={showWorkspace} today={today} />
          </div>
        );
      })}
    </div>
  );
}

function ProblemTable({ problems, showWorkspace, today, queue }: { problems: DsaProblem[]; showWorkspace: boolean; today: string; queue?: boolean }) {
  const navigate = useNavigate();
  const update = useUpdate("dsa");
  const wsMap = useWorkspaceMap();
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Problem</th>
            <th className="w-28 px-3 py-2 font-medium">Difficulty</th>
            <th className="w-40 px-3 py-2 font-medium">Status</th>
            <th className="w-32 px-3 py-2 font-medium">Topic</th>
            <th className="w-32 px-3 py-2 font-medium">{queue ? "Review due" : "Updated"}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {problems.map((p) => {
            const ws = wsMap.get(p.workspaceId);
            const due = isDue(p, today);
            return (
              <tr
                key={p.id}
                className="group cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => navigate(routes.dsa(p.id))}
                onKeyDown={(e) => e.key === "Enter" && navigate(routes.dsa(p.id))}
                tabIndex={0}
              >
                <td className="px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {p.isFavorite ? <Star className="size-3 shrink-0 fill-warning text-warning" /> : null}
                    <span className="truncate font-medium">{p.title}</span>
                    {p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                        aria-label="Open problem link"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
                    {p.platform ? <span>{p.platform}</span> : null}
                    {showWorkspace && ws ? (
                      <span className="inline-flex items-center gap-1">
                        <WorkspaceIcon icon={ws.icon} color={ws.color} size="sm" className="size-3.5" />
                        {ws.name}
                      </span>
                    ) : null}
                    <TagList tags={p.tags} />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <DifficultyPill difficulty={p.difficulty} />
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <Select value={p.status} onValueChange={(v) => update.mutate({ id: p.id, status: v as DsaStatus })}>
                    <SelectTrigger size="sm" className="h-7 w-[136px] border-transparent bg-transparent px-1.5 shadow-none hover:border-border dark:bg-transparent" aria-label="Status">
                      <SelectValue>
                        <DsaStatusPill status={p.status} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {DSA_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          <DsaStatusPill status={s} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="truncate px-3 py-2 text-xs text-muted-foreground">{p.topic || "—"}</td>
                <td className={cn("px-3 py-2 text-xs text-muted-foreground", queue && due && "text-warning")}>
                  {queue ? (p.nextReviewOn ? relativeDay(p.nextReviewOn) : "Now") : timeAgo(p.updatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
