import {
  BarChart3, BookOpen, CalendarDays, ChevronRight, ChevronsLeft, ChevronsRight, Layers, LayoutDashboard, Library,
  LogOut, Moon, MoreHorizontal, Plus, Search, Settings, Sun, NotebookPen,
} from "lucide-react";
import { type DragEvent, type ReactNode, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import type { Workspace } from "@shared/types";
import { Kbd, modKey } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceActions } from "@/features/workspaces/useWorkspaceActions";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/lib/api";
import { useMe, useReorderWorkspaces, useUpdateFolder, useWorkspaces } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { FolderTree, FOLDER_MIME, readDraggedFolder } from "./FolderTree";
import { ActionMenus } from "./menu";
import { useQueryClient } from "@tanstack/react-query";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/workspaces", label: "My Workspaces", icon: Layers, end: true },
  { to: "/calendar", label: "Master Calendar", icon: CalendarDays },
  { to: routes.notebooks(), label: "Notebooks", icon: NotebookPen },
  { to: routes.resources(), label: "Resource Library", icon: Library },
  { to: "/books", label: "Bookshelf", icon: BookOpen },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

const WS_MIME = "application/x-devspace-workspace";

function NavItem({ to, label, icon: Icon, end, collapsed }: { to: string; label: string; icon: typeof Layers; end?: boolean; collapsed: boolean }) {
  const link = (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
          isActive && "bg-sidebar-accent font-medium text-primary",
          collapsed && "justify-center px-0",
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ mobile }: { mobile?: boolean }) {
  const collapsedPref = useUi((s) => s.sidebarCollapsed);
  const collapsed = mobile ? false : collapsedPref;
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const openCapture = useUi((s) => s.openCapture);
  const { data: workspaces } = useWorkspaces();
  const { data: me } = useMe();
  const { toggle } = useTheme();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creatingFolderIn, setCreatingFolderIn] = useState<string | null>(null);
  const setExpanded = useUi((s) => s.setExpanded);
  const { actionsFor, dialog } = useWorkspaceActions((ws) => {
    setExpanded(ws.id, true);
    setCreatingFolderIn(ws.id);
  });
  const active = (workspaces ?? []).filter((w) => !w.archivedAt);

  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    qc.clear();
    qc.setQueryData(["me"], null);
    navigate("/login");
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        mobile ? "w-full" : collapsed ? "w-14" : "w-64",
      )}
      aria-label="Main navigation"
    >
      {/* Brand / account */}
      <div className={cn("flex h-12 items-center gap-2 px-3", collapsed && "justify-center px-0")}>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-sidebar-accent">
            <img src="/favicon.svg" alt="" className="size-6 shrink-0" />
            {!collapsed ? (
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold leading-4">DevSpace</span>
                <span className="block truncate text-2xs text-muted-foreground">{me?.displayName || me?.email}</span>
              </span>
            ) : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{me?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate(routes.settings())}>
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={toggle}>
              <Sun className="dark:hidden" />
              <Moon className="hidden dark:block" /> Toggle theme
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Search & quick action */}
      <div className={cn("flex gap-1.5 px-3 pb-2", collapsed && "flex-col items-center px-2")}>
        <SidebarButton collapsed={collapsed} label="Search" onClick={() => setPaletteOpen(true)} className="flex-1">
          <Search className="size-4 shrink-0" />
          {!collapsed ? (
            <>
              <span className="flex-1 text-left">Search…</span>
              <Kbd>{modKey} K</Kbd>
            </>
          ) : null}
        </SidebarButton>
        <QuickAddMenu collapsed={collapsed} onPick={(k) => openCapture(k)} />
      </div>

      <nav className={cn("space-y-0.5 px-3", collapsed && "px-2")}>
        {NAV.map((n) => (
          <NavItem key={n.to} {...n} collapsed={collapsed} />
        ))}
      </nav>

      {/* Workspaces */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <div className={cn("flex items-center justify-between px-5 pb-1", collapsed && "justify-center px-0")}>
          {!collapsed ? <span className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">Workspaces</span> : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => openCapture("workspace")}
                className="rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                aria-label="New workspace"
              >
                <Plus className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">New workspace</TooltipContent>
          </Tooltip>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-3 pb-3", collapsed && "px-2")}>
          {active.length === 0 && !collapsed ? (
            <button
              type="button"
              onClick={() => openCapture("workspace")}
              className="mt-1 w-full rounded-md border border-dashed px-3 py-3 text-left text-xs text-muted-foreground hover:bg-sidebar-accent"
            >
              Create your first workspace — e.g. DSA, FastAPI or System Design.
            </button>
          ) : null}
          <WorkspaceList
            workspaces={active}
            collapsed={collapsed}
            actionsFor={actionsFor}
            creatingFolderIn={creatingFolderIn}
            onCreatedFolder={() => setCreatingFolderIn(null)}
          />
        </div>
      </div>

      {/* Footer */}
      <div className={cn("flex items-center gap-1 border-t border-sidebar-border px-3 py-2", collapsed && "flex-col px-2")}>
        <NavItem to="/settings" label="Settings" icon={Settings} collapsed={collapsed} />
        {!collapsed ? <div className="flex-1" /> : null}
        <SidebarIcon label="Toggle theme" onClick={toggle}>
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </SidebarIcon>
        {!mobile ? (
          <SidebarIcon label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggleSidebar}>
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </SidebarIcon>
        ) : null}
      </div>
      {dialog}
    </aside>
  );
}

function SidebarButton({ collapsed, label, onClick, children, className }: { collapsed: boolean; label: string; onClick: () => void; children: ReactNode; className?: string }) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md border border-sidebar-border bg-background/60 px-2 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
        collapsed && "w-9 justify-center px-0",
        className,
      )}
    >
      {children}
    </button>
  );
  if (!collapsed) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarIcon({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

const QUICK_ADD = [
  ["note", "Note"],
  ["snippet", "Code snippet"],
  ["resource", "Resource"],
  ["dsa", "DSA problem"],
  ["lld", "LLD exercise"],
  ["activity", "Activity"],
  ["book", "Book"],
  ["workspace", "Workspace"],
] as const;

function QuickAddMenu({ collapsed, onPick }: { collapsed: boolean; onPick: (k: (typeof QUICK_ADD)[number][0]) => void }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90"
            aria-label="Create new"
          >
            <Plus className="size-4" />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side={collapsed ? "right" : "bottom"}>Create new</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Quick capture</DropdownMenuLabel>
        {QUICK_ADD.map(([k, label]) => (
          <DropdownMenuItem key={k} onSelect={() => onPick(k)}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceList({
  workspaces,
  collapsed,
  actionsFor,
  creatingFolderIn,
  onCreatedFolder,
}: {
  workspaces: Workspace[];
  collapsed: boolean;
  actionsFor: ReturnType<typeof useWorkspaceActions>["actionsFor"];
  creatingFolderIn: string | null;
  onCreatedFolder: () => void;
}) {
  const reorder = useReorderWorkspaces();
  const updateFolder = useUpdateFolder();
  const expanded = useUi((s) => s.expanded);
  const toggleExpanded = useUi((s) => s.toggleExpanded);
  const location = useLocation();
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const onDrop = (e: DragEvent, target: Workspace) => {
    setDropTarget(null);
    const wsId = e.dataTransfer.getData(WS_MIME);
    if (wsId && wsId !== target.id) {
      e.preventDefault();
      const ids = workspaces.map((w) => w.id).filter((id) => id !== wsId);
      ids.splice(ids.indexOf(target.id), 0, wsId);
      reorder.mutate(ids);
      return;
    }
    const folder = readDraggedFolder(e);
    if (folder && folder.workspaceId === target.id) {
      e.preventDefault();
      updateFolder.mutate({ id: folder.id, parentId: null });
    }
  };

  return (
    <div className="space-y-0.5" role="tree" aria-label="Workspaces">
      {workspaces.map((ws) => {
        const isActive = location.pathname === `/w/${ws.id}`;
        const open = !!expanded[ws.id] && !collapsed;
        const rowWith = (menuButton?: ReactNode) => (
          <div
            className={cn(
              "group flex h-8 items-center gap-1 rounded-md pr-1 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
              isActive && "bg-sidebar-accent font-medium text-primary",
              dropTarget === ws.id && "ring-1 ring-brand",
              collapsed && "justify-center pr-0",
            )}
            draggable={!collapsed}
            onDragStart={(e) => {
              e.dataTransfer.setData(WS_MIME, ws.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(WS_MIME) || e.dataTransfer.types.includes(FOLDER_MIME)) {
                e.preventDefault();
                setDropTarget(ws.id);
              }
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => onDrop(e, ws)}
          >
            {!collapsed ? (
              <button
                type="button"
                onClick={() => toggleExpanded(ws.id)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={open ? `Collapse ${ws.name}` : `Expand ${ws.name}`}
                aria-expanded={open}
              >
                <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
              </button>
            ) : null}
            <NavLink to={routes.workspace(ws.id)} className={cn("flex min-w-0 flex-1 items-center gap-2 py-1", collapsed && "flex-none")}>
              <WorkspaceIcon icon={ws.icon} color={ws.color} size="sm" />
              {!collapsed ? <span className="truncate">{ws.name}</span> : <span className="sr-only">{ws.name}</span>}
            </NavLink>
            {menuButton}
          </div>
        );
        return (
          <div key={ws.id} role="treeitem" aria-expanded={open} aria-selected={isActive}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{rowWith()}</TooltipTrigger>
                <TooltipContent side="right">{ws.name}</TooltipContent>
              </Tooltip>
            ) : (
              <ActionMenus
                actions={actionsFor(ws)}
                trigger={
                  <button
                    type="button"
                    className="invisible rounded p-0.5 text-muted-foreground group-hover:visible hover:bg-background/60 hover:text-foreground data-[state=open]:visible"
                    aria-label={`${ws.name} actions`}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                }
              >
                {(menuButton) => rowWith(menuButton)}
              </ActionMenus>
            )}
            {open || creatingFolderIn === ws.id ? (
              <FolderTree workspaceId={ws.id} baseDepth={1} creatingRoot={creatingFolderIn === ws.id} onCreatedRoot={onCreatedFolder} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
