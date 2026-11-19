import { Archive, Layers, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { formatMinutes } from "@shared/time";
import type { Workspace, WorkspaceSummary } from "@shared/types";
import { EmptyState, ErrorState, LoadingRows, Page, PageHeader } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { ActionMenus } from "@/components/layout/menu";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DEFAULT_BANNER_URL } from "@/lib/banners";
import { timeAgo } from "@/lib/dates";
import { useWorkspaces, useWorkspaceSummaries } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { useUi } from "@/stores/ui";
import { WORKSPACE_KIND_LABELS } from "@shared/constants";
import { useWorkspaceActions } from "./useWorkspaceActions";

export default function WorkspacesPage() {
  const { data: workspaces, isLoading, error, refetch } = useWorkspaces();
  const { data: summaries } = useWorkspaceSummaries();
  const openCapture = useUi((s) => s.openCapture);
  const { actionsFor, dialog } = useWorkspaceActions();
  const [showArchived, setShowArchived] = useState(false);
  const byId = new Map((summaries ?? []).map((s) => [s.workspaceId, s]));
  const active = (workspaces ?? []).filter((w) => !w.archivedAt);
  const archived = (workspaces ?? []).filter((w) => w.archivedAt);

  return (
    <Page>
      <PageHeader
        title="My Workspaces"
        description="Independent spaces for every subject you're learning."
        actions={
          <Button size="sm" onClick={() => openCapture("workspace")}>
            <Plus /> New workspace
          </Button>
        }
      />
      {isLoading ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : active.length === 0 && archived.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No workspaces yet"
          description="Create a workspace for each subject — DSA, LLD, FastAPI, System Design… Each gets its own folders, notes, code and progress."
          action={
            <Button size="sm" onClick={() => openCapture("workspace")}>
              <Plus /> Create a workspace
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((w) => (
              <WorkspaceCard key={w.id} ws={w} summary={byId.get(w.id)} actions={actionsFor(w)} />
            ))}
          </div>
          {archived.length > 0 ? (
            <div className="mt-10">
              <button type="button" onClick={() => setShowArchived(!showArchived)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <Archive className="size-4" /> {showArchived ? "Hide" : "Show"} archived ({archived.length})
              </button>
              {showArchived ? (
                <div className="mt-3 grid gap-3 opacity-75 sm:grid-cols-2 lg:grid-cols-3">
                  {archived.map((w) => (
                    <WorkspaceCard key={w.id} ws={w} summary={byId.get(w.id)} actions={actionsFor(w)} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      {dialog}
    </Page>
  );
}

function WorkspaceCard({ ws, summary, actions }: { ws: Workspace; summary?: WorkspaceSummary; actions: ReturnType<ReturnType<typeof useWorkspaceActions>["actionsFor"]> }) {
  const pct = summary?.progress != null ? Math.round(summary.progress * 100) : null;
  return (
    <ActionMenus
      actions={actions}
      align="end"
      trigger={
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`${ws.name} actions`}>
          <MoreHorizontal className="size-4" />
        </button>
      }
    >
      {(menuButton) => (
        <div className="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-soft p-4 transition-colors hover:border-foreground/20">
          <img
            src={ws.bannerUrl || DEFAULT_BANNER_URL}
            alt=""
            loading="lazy"
            className="-mx-4 -mt-4 mb-4 h-24 w-[calc(100%+2rem)] max-w-none object-cover"
            style={{ objectPosition: `50% ${ws.bannerUrl ? ws.bannerPosition : 50}%` }}
            onError={(e) => {
              if (!e.currentTarget.src.endsWith(DEFAULT_BANNER_URL)) e.currentTarget.src = DEFAULT_BANNER_URL;
            }}
          />
          <div className="flex items-start justify-between gap-2">
            <Link to={routes.workspace(ws.id)} className="flex min-w-0 items-center gap-3 after:absolute after:inset-0">
              <WorkspaceIcon icon={ws.icon} color={ws.color} size="lg" />
              <div className="min-w-0">
                <h3 className="truncate text-sm font-medium">{ws.name}</h3>
                <p className="text-xs text-muted-foreground">{WORKSPACE_KIND_LABELS[ws.kind]}</p>
              </div>
            </Link>
            <div className="relative z-10">{menuButton}</div>
          </div>
          {ws.description ? <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{ws.description}</p> : null}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-2xs text-muted-foreground">
              <span>Progress</span>
              <span className="tabular">{pct === null ? "—" : `${pct}%`}</span>
            </div>
            <Progress value={pct ?? 0} className="h-1" style={{ ["--progress-color" as string]: ws.color }} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-2xs text-muted-foreground">
            <div>
              <dt>Items</dt>
              <dd className="text-sm font-medium text-foreground tabular">
                {summary ? summary.notes + summary.snippets + summary.resources + summary.dsaProblems + summary.lldExercises : "—"}
              </dd>
            </div>
            <div>
              <dt>Done</dt>
              <dd className="text-sm font-medium text-foreground tabular">
                {summary ? `${summary.activitiesCompleted}/${summary.activitiesTotal}` : "—"}
              </dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd className="text-sm font-medium text-foreground tabular">{summary ? formatMinutes(summary.minutes) : "—"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-2xs text-muted-foreground">{summary?.lastActivityAt ? `Active ${timeAgo(summary.lastActivityAt)}` : "No activity yet"}</p>
        </div>
      )}
    </ActionMenus>
  );
}
