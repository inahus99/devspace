import { Archive, ArchiveRestore, CalendarPlus, Download, FilePlus2, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Workspace } from "@shared/types";
import { confirm } from "@/components/common/ConfirmDialog";
import type { MenuAction } from "@/components/layout/menu";
import { downloadUrl } from "@/lib/api";
import { useDeleteWorkspace, useUpdateWorkspace } from "@/lib/queries";
import { useUi } from "@/stores/ui";
import { WorkspaceDialog } from "./WorkspaceDialog";

/** Shared workspace context-menu actions (sidebar, workspaces grid, workspace header). */
export function useWorkspaceActions(onNewFolder?: (ws: Workspace) => void) {
  const [editing, setEditing] = useState<Workspace | null>(null);
  const update = useUpdateWorkspace();
  const del = useDeleteWorkspace();
  const openCapture = useUi((s) => s.openCapture);
  const navigate = useNavigate();
  const location = useLocation();

  const actionsFor = (ws: Workspace): MenuAction[] => [
    ...(onNewFolder ? [{ label: "New folder", icon: FolderPlus, onSelect: () => onNewFolder(ws) }] : []),
    { label: "New note", icon: FilePlus2, onSelect: () => openCapture("note", { workspaceId: ws.id }) },
    { label: "Plan activity", icon: CalendarPlus, onSelect: () => openCapture("activity", { workspaceId: ws.id }) },
    { label: "Edit name, icon & colour", icon: Pencil, onSelect: () => setEditing(ws), separatorBefore: true },
    { label: "Export notes (Markdown)", icon: Download, onSelect: () => downloadUrl("/export/notes.zip", { workspaceId: ws.id }) },
    ws.archivedAt
      ? { label: "Unarchive", icon: ArchiveRestore, onSelect: () => update.mutate({ id: ws.id, archived: false }) }
      : { label: "Archive", icon: Archive, onSelect: () => update.mutate({ id: ws.id, archived: true }) },
    {
      label: "Delete",
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      onSelect: async () => {
        const ok = await confirm({
          title: `Delete “${ws.name}”?`,
          description:
            "This permanently deletes the workspace with all its folders, notes, snippets, DSA problems, LLD exercises and files. Resources, books and activities are kept but unassigned. Consider archiving or exporting first.",
          destructive: true,
          confirmLabel: "Delete workspace",
        });
        if (!ok) return;
        del.mutate(ws.id, {
          onSuccess: () => {
            if (location.pathname.startsWith(`/w/${ws.id}`)) navigate("/workspaces");
          },
        });
      },
    },
  ];

  const dialog = (
    <WorkspaceDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} workspace={editing ?? undefined} />
  );
  return { actionsFor, dialog, edit: setEditing };
}
