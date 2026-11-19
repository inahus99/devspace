import { Archive, ChevronRight, Folder as FolderIcon, FolderPlus, MoreHorizontal, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { WORKSPACE_KIND_LABELS } from "@shared/constants";
import { formatMinutes } from "@shared/time";
import { AttachmentsPanel } from "@/components/common/Attachments";
import { Banner, type BannerPatch } from "@/components/common/Banner";
import { DEFAULT_BANNER_URL } from "@/lib/banners";
import { flattenFolders } from "@/components/common/fields";
import { ErrorState, FullPageSpinner, Section, Stat } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { FolderTree } from "@/components/layout/FolderTree";
import { ActionMenus } from "@/components/layout/menu";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { DsaTracker } from "@/features/dsa/DsaTracker";
import { LldList } from "@/features/lld/LldList";
import { ItemNotFound } from "@/features/misc/NotFoundPage";
import { NotesList } from "@/features/notes/NotesList";
import { WorkspaceActivities } from "@/features/planner/WorkspaceActivities";
import { ResourceList } from "@/features/resources/ResourceList";
import { SnippetsList } from "@/features/snippets/SnippetsList";
import { timeAgo } from "@/lib/dates";
import { useList, useUpdateFolder, useUpdateWorkspace, useWorkspaceFolders, useWorkspaces, useWorkspaceSummaries } from "@/lib/queries";
import { routes, type WorkspaceTab } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type CaptureKind, useUi } from "@/stores/ui";
import { TopicView } from "./TopicView";
import { useWorkspaceActions } from "./useWorkspaceActions";

const TAB_LABELS: Record<WorkspaceTab, string> = {
  contents: "Contents",
  overview: "Progress",
  dsa: "Questions",
  lld: "Design exercises",
  notes: "Notes",
  snippets: "Code",
  resources: "Resources",
  files: "Files",
  activities: "Activities",
};

export default function WorkspacePage() {
  const { id } = useParams();
  const { data: workspaces, isLoading, error, refetch } = useWorkspaces();
  const ws = workspaces?.find((w) => w.id === id);
  const [params, setParams] = useSearchParams();
  const { data: summaries } = useWorkspaceSummaries();
  const summary = summaries?.find((s) => s.workspaceId === id);
  const folders = useWorkspaceFolders(id);
  const openCapture = useUi((s) => s.openCapture);
  const { actionsFor, dialog } = useWorkspaceActions();
  const [creatingFolder, setCreatingFolder] = useState(false);
  const updateWorkspace = useUpdateWorkspace();
  const updateFolder = useUpdateFolder();

  const folderId = params.get("folder");
  const folder = folders.find((f) => f.id === folderId) ?? null;

  const tabs = useMemo<WorkspaceTab[]>(() => {
    const special: WorkspaceTab[] = [];
    if (ws?.kind === "dsa" || (summary?.dsaProblems ?? 0) > 0) special.push("dsa");
    if (ws?.kind === "lld" || (summary?.lldExercises ?? 0) > 0) special.push("lld");
    return ["contents", ...special, "notes", "snippets", "resources", "files", "activities", "overview"];
  }, [ws?.kind, summary?.dsaProblems, summary?.lldExercises]);

  // Every workspace and folder opens on its topic page: sub-folders, screenshots, notes, code, links, questions.
  const defaultTab: WorkspaceTab = "contents";
  const requested = params.get("tab") as WorkspaceTab | null;
  const tab: WorkspaceTab = requested && tabs.includes(requested) ? requested : defaultTab;

  const folderPath = useMemo(() => {
    if (!folder) return [];
    const byId = new Map(folders.map((f) => [f.id, f]));
    const path = [];
    let cur: typeof folder | undefined = folder;
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return path;
  }, [folder, folders]);
  const subfolders = folders.filter((f) => f.parentId === (folder?.id ?? null)).sort((a, b) => a.position - b.position);

  if (isLoading) return <FullPageSpinner />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} className="m-8" />;
  if (!ws) return <ItemNotFound what="workspace" backTo="/workspaces" backLabel="All workspaces" />;

  const setTab = (t: WorkspaceTab) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    setParams(next, { replace: true });
  };
  const setFolder = (fid: string | null) => {
    const next = new URLSearchParams(params);
    if (fid) next.set("folder", fid);
    else next.delete("folder");
    if (tab === "overview") next.delete("tab");
    setParams(next);
  };
  const capture = (kind: CaptureKind) => openCapture(kind, { workspaceId: ws.id, folderId: folder?.id ?? null });
  const pct = summary?.progress != null ? Math.round(summary.progress * 100) : null;
  // Inside a folder, the banner is the one of its main (top-level) folder; otherwise the workspace's.
  // Without its own image a folder shows the workspace banner, and a workspace shows the default artwork.
  const mainFolder = folderPath[0] ?? null;
  const banner = mainFolder
    ? {
        key: mainFolder.id,
        url: mainFolder.bannerUrl,
        position: mainFolder.bannerPosition,
        name: mainFolder.name,
        eyebrow: `${ws.name} · ${mainFolder.name}`,
        fallbackUrl: ws.bannerUrl || DEFAULT_BANNER_URL,
        fallbackPosition: ws.bannerUrl ? ws.bannerPosition : 50,
        uploadTarget: { workspaceId: ws.id, folderId: mainFolder.id },
        onChange: (patch: BannerPatch) => updateFolder.mutateAsync({ id: mainFolder.id, ...patch }),
      }
    : {
        key: ws.id,
        url: ws.bannerUrl,
        position: ws.bannerPosition,
        name: ws.name,
        eyebrow: undefined,
        fallbackUrl: DEFAULT_BANNER_URL,
        fallbackPosition: 50,
        uploadTarget: { workspaceId: ws.id },
        onChange: (patch: BannerPatch) => updateWorkspace.mutateAsync({ id: ws.id, ...patch }),
      };
  const { key: bannerKey, ...bannerProps } = banner;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8">
      <Banner {...bannerProps} key={bannerKey} className="mb-5" />
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <WorkspaceIcon icon={ws.icon} color={ws.color} size="lg" />
          <div className="min-w-0">
            {folder ? <p className="text-2xs font-medium tracking-[0.16em] text-muted-foreground uppercase">{ws.name}</p> : null}
            <h1 className="flex items-center gap-2 truncate text-2xl font-semibold tracking-tight">
              {folder ? folder.name : ws.name}
              {ws.archivedAt ? (
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-2xs font-normal text-muted-foreground">
                  <Archive className="size-3" /> Archived
                </span>
              ) : null}
            </h1>
            {!folder ? <p className="text-sm text-muted-foreground">{ws.description || WORKSPACE_KIND_LABELS[ws.kind]}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus /> New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {ws.kind === "dsa" || tabs.includes("dsa") ? <DropdownMenuItem onSelect={() => capture("dsa")}>DSA problem</DropdownMenuItem> : null}
              {ws.kind === "lld" || tabs.includes("lld") ? <DropdownMenuItem onSelect={() => capture("lld")}>LLD exercise</DropdownMenuItem> : null}
              <DropdownMenuItem onSelect={() => capture("note")}>Note</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => capture("snippet")}>Code snippet</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => capture("resource")}>Resource / link</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCapture("book", { workspaceId: ws.id })}>Book</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCapture("activity", { workspaceId: ws.id })}>Activity</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCreatingFolder(true)}>Folder</DropdownMenuItem>
              {ws.kind !== "dsa" && !tabs.includes("dsa") ? <DropdownMenuItem onSelect={() => capture("dsa")}>DSA problem</DropdownMenuItem> : null}
              {ws.kind !== "lld" && !tabs.includes("lld") ? <DropdownMenuItem onSelect={() => capture("lld")}>LLD exercise</DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <ActionMenus
            actions={actionsFor(ws)}
            align="end"
            trigger={
              <Button variant="ghost" size="icon" className="size-8" aria-label="Workspace actions">
                <MoreHorizontal />
              </Button>
            }
          >
            {(menuButton) => <span>{menuButton}</span>}
          </ActionMenus>
        </div>
      </div>

      {/* Folder breadcrumb & sub-folders */}
      {folder ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-sm">
          <button type="button" onClick={() => setFolder(null)} className="text-muted-foreground hover:text-foreground">
            {ws.name}
          </button>
          {folderPath.map((f) => (
            <span key={f.id} className="flex items-center gap-1.5">
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <button type="button" onClick={() => setFolder(f.id)} className={cn(f.id === folder.id ? "font-medium" : "text-muted-foreground hover:text-foreground")}>
                {f.name}
              </button>
            </span>
          ))}
          <button type="button" onClick={() => setFolder(null)} className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-accent" aria-label="Clear folder filter">
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      {folder && subfolders.length > 0 && tab !== "contents" ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {subfolders.map((f) => (
            <button key={f.id} type="button" onClick={() => setFolder(f.id)} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-accent">
              <FolderIcon className="size-3.5 text-muted-foreground" /> {f.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="no-scrollbar mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border bg-muted/60 p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-[13px] transition-[color,background-color,box-shadow]",
              tab === t ? "bg-card font-medium text-foreground shadow-soft" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="pt-5" role="tabpanel">
        {tab === "contents" ? (
          <TopicView workspace={ws} folder={folder} folders={folders} onOpenFolder={(fid) => setFolder(fid)} capture={capture} />
        ) : tab === "overview" ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Progress" value={pct === null ? "—" : `${pct}%`} hint="Done ÷ tracked items" />
                <Stat label="Study time" value={summary ? formatMinutes(summary.minutes) : "—"} hint="Recorded, overlap-safe" />
                <Stat label="Activities" value={summary ? `${summary.activitiesCompleted}/${summary.activitiesTotal}` : "—"} hint="Completed / planned" />
                <Stat label="Last active" value={<span className="text-base">{summary?.lastActivityAt ? timeAgo(summary.lastActivityAt) : "—"}</span>} />
              </div>
              {pct !== null ? <Progress value={pct} className="h-1.5" /> : null}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {(
                  [
                    ["notes", summary?.notes],
                    ["snippets", summary?.snippets],
                    ["resources", summary?.resources],
                    ["dsa", summary?.dsaProblems],
                    ["lld", summary?.lldExercises],
                  ] as const
                ).map(([t, n]) => (
                  <button key={t} type="button" onClick={() => setTab(t)} className="rounded-xl border bg-card shadow-soft px-3 py-2 text-left hover:bg-accent/50">
                    <div className="text-lg font-semibold tabular">{n ?? 0}</div>
                    <div className="text-xs text-muted-foreground">{TAB_LABELS[t]}</div>
                  </button>
                ))}
              </div>
              <RecentNotes workspaceId={ws.id} onAll={() => setTab("notes")} />
              <WorkspaceActivities workspaceId={ws.id} />
            </div>
            <Section
              title="Folders"
              action={
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setCreatingFolder(true)}>
                  <FolderPlus /> New
                </Button>
              }
              bodyClassName="p-2"
            >
              {folders.length === 0 && !creatingFolder ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No folders yet. Organise topics like “Arrays → Two Pointers” with unlimited nesting.
                </p>
              ) : (
                <FolderTree workspaceId={ws.id} creatingRoot={creatingFolder} onCreatedRoot={() => setCreatingFolder(false)} />
              )}
              <p className="px-2 pt-2 text-2xs text-muted-foreground">Drag folders onto each other to nest them. Right-click for more.</p>
            </Section>
          </div>
        ) : tab === "dsa" ? (
          <DsaTracker workspaceId={ws.id} folderId={folder?.id ?? null} />
        ) : tab === "lld" ? (
          <LldList workspaceId={ws.id} folderId={folder?.id ?? null} />
        ) : tab === "notes" ? (
          <NotesList workspaceId={ws.id} folderId={folder?.id ?? null} />
        ) : tab === "snippets" ? (
          <SnippetsList workspaceId={ws.id} folderId={folder?.id ?? null} />
        ) : tab === "resources" ? (
          <ResourceList workspaceId={ws.id} folderId={folder?.id ?? null} />
        ) : tab === "files" ? (
          <AttachmentsPanel
            target={{ workspaceId: ws.id, folderId: folder?.id ?? null }}
            query={{ workspaceId: ws.id, folderId: folder?.id ?? undefined }}
            standalone
            title={folder ? `Files in ${folder.name}` : "Workspace files"}
            emptyHint="PDFs, screenshots and other files for this workspace. Drop, paste or upload."
          />
        ) : (
          <WorkspaceActivities workspaceId={ws.id} />
        )}
      </div>
      {creatingFolder && tab !== "overview" && tab !== "contents" ? (
        <div className="fixed right-6 bottom-6 z-40 w-72 rounded-lg border bg-popover p-2 shadow-lg">
          <p className="px-2 pb-1 text-xs text-muted-foreground">New folder in {ws.name}</p>
          <FolderTree workspaceId={ws.id} creatingRoot onCreatedRoot={() => setCreatingFolder(false)} />
        </div>
      ) : null}
      {dialog}
    </div>
  );
}

function RecentNotes({ workspaceId, onAll }: { workspaceId: string; onAll: () => void }) {
  const { data } = useList("notes", { workspaceId, limit: 5 });
  const folders = useWorkspaceFolders(workspaceId);
  const paths = new Map(flattenFolders(folders).map((f) => [f.folder.id, f.path]));
  return (
    <Section
      title="Recently edited notes"
      action={
        <button type="button" onClick={onAll} className="rounded-md px-1.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-secondary">
          View all
        </button>
      }
      bodyClassName="p-0"
    >
      {!data?.length ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">No notes in this workspace yet.</p>
      ) : (
        <ul className="divide-y">
          {data.map((n) => (
            <li key={n.id}>
              <Link to={routes.note(n.id)} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-accent/40">
                <span className="min-w-0 truncate">{n.title || "Untitled"}</span>
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {n.folderId ? `${paths.get(n.folderId)} · ` : ""}
                  {timeAgo(n.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
