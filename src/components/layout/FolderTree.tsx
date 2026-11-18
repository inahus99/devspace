import {
  ArrowDown, ArrowUp, ChevronRight, Folder as FolderIcon, FolderInput, FolderOpen, FolderPlus, MoreHorizontal, Pencil, Trash2,
} from "lucide-react";
import { type DragEvent, type KeyboardEvent, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import type { Folder } from "@shared/types";
import { confirm } from "@/components/common/ConfirmDialog";
import { Field, FolderSelect } from "@/components/common/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { routes } from "@/lib/routes";
import { useCreateFolder, useDeleteFolder, useUpdateFolder, useWorkspaceFolders } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { ActionMenus } from "./menu";

export const FOLDER_MIME = "application/x-devspace-folder";

export interface DraggedFolder {
  id: string;
  workspaceId: string;
}

export function readDraggedFolder(e: DragEvent): DraggedFolder | null {
  try {
    const raw = e.dataTransfer.getData(FOLDER_MIME);
    return raw ? (JSON.parse(raw) as DraggedFolder) : null;
  } catch {
    return null;
  }
}

function childrenMap(folders: Folder[]) {
  const map = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const list = map.get(f.parentId) ?? [];
    list.push(f);
    map.set(f.parentId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  return map;
}

/** Inline name editor used for create & rename. */
function InlineName({ initial, onSubmit, onCancel, depth }: { initial: string; onSubmit: (v: string) => void; onCancel: () => void; depth: number }) {
  const [value, setValue] = useState(initial);
  const done = () => {
    const v = value.trim();
    if (v && v !== initial) onSubmit(v);
    else onCancel();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") done();
    if (e.key === "Escape") onCancel();
  };
  return (
    <div className="flex items-center gap-1 py-0.5 pr-2" style={{ paddingLeft: 8 + depth * 14 + 16 }}>
      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={done}
        placeholder="Folder name"
        aria-label="Folder name"
        className="h-6 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 text-[13px] outline-none"
      />
    </div>
  );
}

export function MoveFolderDialog({ folder, onClose }: { folder: Folder | null; onClose: () => void }) {
  const [target, setTarget] = useState<string | null>(null);
  const update = useUpdateFolder();
  return (
    <Dialog open={!!folder} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move “{folder?.name}”</DialogTitle>
        </DialogHeader>
        {folder ? (
          <Field label="New location">
            <FolderSelect workspaceId={folder.workspaceId} value={target ?? folder.parentId} onChange={setTarget} exclude={folder.id} rootLabel="Workspace root" />
          </Field>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (folder) update.mutate({ id: folder.id, parentId: target }, { onSuccess: onClose });
            }}
            disabled={update.isPending}
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Nested, persistent folder tree for one workspace. Supports create, rename,
 * delete, move (drag a folder onto another, or "Move to…"), reorder (move up/down)
 * and expand/collapse (remembered per browser).
 */
export function FolderTree({
  workspaceId,
  baseDepth = 0,
  creatingRoot,
  onCreatedRoot,
  dense,
}: {
  workspaceId: string;
  baseDepth?: number;
  creatingRoot?: boolean;
  onCreatedRoot?: () => void;
  dense?: boolean;
}) {
  const folders = useWorkspaceFolders(workspaceId);
  const tree = useMemo(() => childrenMap(folders), [folders]);
  const create = useCreateFolder();
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState<Folder | null>(null);

  return (
    <div role="group">
      <Nodes
        parentId={null}
        depth={baseDepth}
        tree={tree}
        workspaceId={workspaceId}
        creatingIn={creatingIn}
        setCreatingIn={setCreatingIn}
        renaming={renaming}
        setRenaming={setRenaming}
        setMoving={setMoving}
        dense={dense}
      />
      {creatingRoot ? (
        <InlineName
          initial=""
          depth={baseDepth}
          onCancel={() => onCreatedRoot?.()}
          onSubmit={(name) => {
            create.mutate({ workspaceId, parentId: null, name });
            onCreatedRoot?.();
          }}
        />
      ) : null}
      <MoveFolderDialog folder={moving} onClose={() => setMoving(null)} />
    </div>
  );
}

interface NodesProps {
  parentId: string | null;
  depth: number;
  tree: Map<string | null, Folder[]>;
  workspaceId: string;
  creatingIn: string | null;
  setCreatingIn: (id: string | null) => void;
  renaming: string | null;
  setRenaming: (id: string | null) => void;
  setMoving: (f: Folder) => void;
  dense?: boolean;
}

function Nodes(props: NodesProps) {
  const { parentId, depth, tree, workspaceId, creatingIn, setCreatingIn } = props;
  const create = useCreateFolder();
  const list = tree.get(parentId) ?? [];
  return (
    <>
      {list.map((f, i) => (
        <FolderNode key={f.id} folder={f} index={i} siblings={list.length} {...props} />
      ))}
      {creatingIn === parentId && parentId !== null ? (
        <InlineName
          initial=""
          depth={depth}
          onCancel={() => setCreatingIn(null)}
          onSubmit={(name) => {
            create.mutate({ workspaceId, parentId, name });
            setCreatingIn(null);
          }}
        />
      ) : null}
    </>
  );
}

function FolderNode({ folder, index, siblings, ...props }: NodesProps & { folder: Folder; index: number; siblings: number }) {
  const { depth, tree, setCreatingIn, renaming, setRenaming, setMoving, dense } = props;
  const expanded = useUi((s) => !!s.expanded[folder.id]);
  const setExpanded = useUi((s) => s.setExpanded);
  const toggleExpanded = useUi((s) => s.toggleExpanded);
  const update = useUpdateFolder();
  const del = useDeleteFolder();
  const [dropping, setDropping] = useState(false);
  const [params] = useSearchParams();
  const location = useLocation();
  const active = location.pathname === `/w/${folder.workspaceId}` && params.get("folder") === folder.id;
  const hasChildren = (tree.get(folder.id)?.length ?? 0) > 0 || props.creatingIn === folder.id;

  if (renaming === folder.id) {
    return (
      <InlineName
        initial={folder.name}
        depth={depth}
        onCancel={() => setRenaming(null)}
        onSubmit={(name) => {
          update.mutate({ id: folder.id, name });
          setRenaming(null);
        }}
      />
    );
  }

  const onDrop = (e: DragEvent) => {
    setDropping(false);
    const dragged = readDraggedFolder(e);
    if (!dragged || dragged.id === folder.id || dragged.workspaceId !== folder.workspaceId) return;
    e.preventDefault();
    e.stopPropagation();
    update.mutate({ id: dragged.id, parentId: folder.id });
    setExpanded(folder.id, true);
  };

  const actions = [
    { label: "New subfolder", icon: FolderPlus, onSelect: () => (setExpanded(folder.id, true), setCreatingIn(folder.id)) },
    { label: "Rename", icon: Pencil, onSelect: () => setRenaming(folder.id) },
    { label: "Move to…", icon: FolderInput, onSelect: () => setMoving(folder) },
    { label: "Move up", icon: ArrowUp, onSelect: () => update.mutate({ id: folder.id, position: index - 1 }), disabled: index === 0 },
    { label: "Move down", icon: ArrowDown, onSelect: () => update.mutate({ id: folder.id, position: index + 1 }), disabled: index >= siblings - 1 },
    {
      label: "Delete",
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      onSelect: async () => {
        if (
          await confirm({
            title: `Delete folder “${folder.name}”?`,
            description: "Its sub-folders are deleted too. Notes, snippets and other items inside are kept and moved to the workspace root.",
            destructive: true,
          })
        )
          del.mutate(folder.id);
      },
    },
  ];

  return (
    <div role="treeitem" aria-expanded={hasChildren ? expanded : undefined} aria-selected={active}>
      <ActionMenus
        actions={actions}
        trigger={
          <button
            type="button"
            className="invisible rounded p-0.5 text-muted-foreground group-hover:visible hover:bg-background/60 hover:text-foreground data-[state=open]:visible"
            aria-label={`${folder.name} actions`}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        }
      >
        {(menuButton) => (
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md pr-1 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
            dense ? "h-7" : "h-7",
            active && "bg-sidebar-accent font-medium text-foreground",
            dropping && "ring-1 ring-brand",
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(FOLDER_MIME, JSON.stringify({ id: folder.id, workspaceId: folder.workspaceId }));
            e.dataTransfer.effectAllowed = "move";
            e.stopPropagation();
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(FOLDER_MIME)) {
              e.preventDefault();
              setDropping(true);
            }
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={onDrop}
        >
          <button
            type="button"
            onClick={() => toggleExpanded(folder.id)}
            className={cn("rounded p-0.5 text-muted-foreground hover:text-foreground", !hasChildren && "invisible")}
            aria-label={expanded ? "Collapse" : "Expand"}
            tabIndex={hasChildren ? 0 : -1}
          >
            <ChevronRight className={cn("size-3 transition-transform", expanded && "rotate-90")} />
          </button>
          <Link
            to={routes.workspace(folder.workspaceId, { folder: folder.id })}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 outline-none"
            onDoubleClick={() => setRenaming(folder.id)}
          >
            {expanded && hasChildren ? (
              <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{folder.name}</span>
          </Link>
          {menuButton}
        </div>
        )}
      </ActionMenus>
      {expanded ? <Nodes {...props} parentId={folder.id} depth={depth + 1} /> : null}
    </div>
  );
}
