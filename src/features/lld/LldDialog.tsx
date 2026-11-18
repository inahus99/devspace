import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { DSA_DIFFICULTIES, DSA_DIFFICULTY_LABELS, type DsaDifficulty } from "@shared/constants";
import { lldCreateSchema } from "@shared/schemas";
import { type CaptureDialogProps, str } from "@/components/common/capture";
import { EnumSelect, Field, FolderSelect, WorkspaceSelect } from "@/components/common/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreate, useWorkspaces } from "@/lib/queries";
import { routes } from "@/lib/routes";

export function LldDialog({ open, onOpenChange, defaults }: CaptureDialogProps) {
  const navigate = useNavigate();
  const create = useCreate("lld");
  const { data: workspaces } = useWorkspaces();
  const defaultWs = useMemo(() => {
    const fromDefaults = str(defaults?.workspaceId);
    if (fromDefaults) return fromDefaults;
    const active = (workspaces ?? []).filter((w) => !w.archivedAt);
    return (active.find((w) => w.kind === "lld") ?? active[0])?.id ?? null;
  }, [defaults, workspaces]);

  const [title, setTitle] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(defaultWs);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<DsaDifficulty | null>(null);
  const [errors, setErrors] = useState<{ title?: string; workspaceId?: string }>({});

  useEffect(() => {
    if (!open) return;
    setTitle(str(defaults?.title) ?? "");
    setWorkspaceId(defaultWs);
    setFolderId(str(defaults?.folderId) ?? null);
    setDifficulty(null);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && !workspaceId && defaultWs) setWorkspaceId(defaultWs);
  }, [open, workspaceId, defaultWs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = lldCreateSchema.safeParse({ title, workspaceId: workspaceId ?? "", folderId, difficulty });
    if (!parsed.success) {
      const next: { title?: string; workspaceId?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "title") next.title = "Give the exercise a title";
        if (issue.path[0] === "workspaceId") next.workspaceId = "Choose a workspace";
      }
      setErrors(next);
      return;
    }
    try {
      const row = await create.mutateAsync(parsed.data);
      onOpenChange(false);
      navigate(routes.lld(row.id));
    } catch {
      /* toast shown by hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>New design exercise</DialogTitle>
            <DialogDescription>Requirements, diagrams, patterns and code are added on the exercise page.</DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor="lld-title" error={errors.title}>
            <Input id="lld-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Parking Lot, Elevator, Splitwise" autoFocus aria-invalid={!!errors.title} />
          </Field>
          <Field label="Workspace" error={errors.workspaceId}>
            <WorkspaceSelect
              value={workspaceId}
              kinds={["lld"]}
              onChange={(v) => {
                setWorkspaceId(v);
                setFolderId(null);
              }}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Folder">
              <FolderSelect workspaceId={workspaceId} value={folderId} onChange={setFolderId} rootLabel="No folder" />
            </Field>
            <Field label="Difficulty">
              <EnumSelect value={difficulty} onChange={setDifficulty} options={DSA_DIFFICULTIES} labels={DSA_DIFFICULTY_LABELS} allowNone noneLabel="Not set" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create exercise"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
