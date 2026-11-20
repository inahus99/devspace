import { FileText, Hash, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { NoteFormat } from "@shared/constants";
import { type CaptureDialogProps, str } from "@/components/common/capture";
import { Field, FolderSelect, WorkspaceSelect } from "@/components/common/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreate, useWorkspaces } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { goTo } from "@/lib/app";
import { cn } from "@/lib/utils";

export function NoteCreateDialog({ open, onOpenChange, defaults }: CaptureDialogProps) {
  const { data: workspaces } = useWorkspaces();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<NoteFormat>("rich");
  const [error, setError] = useState<string | null>(null);
  const create = useCreate("notes");
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setWorkspaceId(str(defaults?.workspaceId) ?? workspaces?.find((w) => !w.archivedAt)?.id ?? null);
    setFolderId(str(defaults?.folderId) ?? null);
    setTitle(str(defaults?.title) ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!workspaceId) {
      setError("Choose a workspace");
      return;
    }
    create.mutate(
      { workspaceId, folderId, title: title.trim() || "Untitled", format },
      {
        onSuccess: (note) => {
          onOpenChange(false);
          goTo(navigate, routes.note(note.id));
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>New note</DialogTitle>
          </DialogHeader>
          <Field label="Title" htmlFor="note-title">
            <Input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Workspace" error={error}>
              <WorkspaceSelect
                value={workspaceId}
                onChange={(v) => {
                  setWorkspaceId(v);
                  setFolderId(null);
                  setError(null);
                }}
              />
            </Field>
            <Field label="Folder">
              <FolderSelect workspaceId={workspaceId} value={folderId} onChange={setFolderId} rootLabel="No folder" />
            </Field>
          </div>
          <Field label="Editor">
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(
                [
                  ["rich", "Rich text", "Headings, tables, checklists, screenshots", FileText],
                  ["markdown", "Markdown", "Plain Markdown source with live preview", Hash],
                ] as const
              ).map(([value, label, hint, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={format === value}
                  onClick={() => setFormat(value)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left transition-colors",
                    format === value ? "border-brand/50 bg-brand-soft" : "hover:bg-accent",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Icon className="size-3.5" />
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : null}
              Create note
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
