import { Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { WORKSPACE_COLORS, WORKSPACE_KIND_LABELS, WORKSPACE_KINDS, type WorkspaceKind } from "@shared/constants";
import { workspaceCreateSchema } from "@shared/schemas";
import type { Workspace } from "@shared/types";
import type { CaptureDialogProps } from "@/components/common/capture";
import { EnumSelect, Field } from "@/components/common/fields";
import { ColorPicker, IconPicker, WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useCreateWorkspace, useUpdateWorkspace } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { useQueryClient } from "@tanstack/react-query";

/** Optional starter structure — a one-off convenience, fully editable afterwards. */
const STARTER_FOLDERS: Partial<Record<WorkspaceKind, string[]>> = {
  dsa: ["Arrays", "Two Pointers", "Sliding Window", "Prefix Sum", "Binary Search", "Trees", "Graphs", "Dynamic Programming"],
  lld: ["SOLID", "Design Patterns", "Machine Coding", "Design Exercises"],
};

const DEFAULT_ICON: Record<WorkspaceKind, string> = { general: "folder", dsa: "binary", lld: "boxes" };

export function WorkspaceDialog({
  open,
  onOpenChange,
  workspace,
  defaults,
}: CaptureDialogProps & { workspace?: Workspace }) {
  const editing = !!workspace;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<WorkspaceKind>("general");
  const [icon, setIcon] = useState("folder");
  const [iconTouched, setIconTouched] = useState(false);
  const [color, setColor] = useState<string>(WORKSPACE_COLORS[0]);
  const [starter, setStarter] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const create = useCreateWorkspace();
  const update = useUpdateWorkspace();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setName(workspace?.name ?? (typeof defaults?.name === "string" ? defaults.name : ""));
    setDescription(workspace?.description ?? "");
    setKind(workspace?.kind ?? "general");
    setIcon(workspace?.icon ?? "folder");
    setIconTouched(!!workspace);
    setColor(workspace?.color ?? WORKSPACE_COLORS[Math.floor(Math.random() * WORKSPACE_COLORS.length)]!);
    setStarter(true);
    setError(null);
  }, [open, workspace, defaults]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = workspaceCreateSchema.safeParse({ name, description, kind, icon, color });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid");
      return;
    }
    if (editing) {
      update.mutate({ id: workspace.id, ...parsed.data }, { onSuccess: () => onOpenChange(false) });
      return;
    }
    try {
      const ws = await create.mutateAsync(parsed.data);
      const folders = STARTER_FOLDERS[kind];
      if (starter && folders) {
        setSeeding(true);
        for (const f of folders) await api.post("/folders", { workspaceId: ws.id, name: f });
        await qc.invalidateQueries({ queryKey: ["folders"] });
      }
      onOpenChange(false);
      navigate(routes.workspace(ws.id));
    } catch {
      /* toast shown */
    } finally {
      setSeeding(false);
    }
  };

  const busy = create.isPending || update.isPending || seeding;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit workspace" : "New workspace"}</DialogTitle>
            <DialogDescription>A space for one subject — its own folders, notes, code, resources and progress.</DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3">
            <WorkspaceIcon icon={icon} color={color} size="lg" />
            <Field label="Name" htmlFor="ws-name" error={error} className="flex-1">
              <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. System Design" autoFocus maxLength={60} />
            </Field>
          </div>
          <Field label="Description" htmlFor="ws-desc">
            <Textarea id="ws-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional" maxLength={500} />
          </Field>
          <Field label="Type" hint="DSA and LLD workspaces get dedicated trackers; every workspace has notes, code, resources and files.">
            <EnumSelect
              value={kind}
              onChange={(v) => {
                const k = v ?? "general";
                setKind(k);
                if (!iconTouched) setIcon(DEFAULT_ICON[k]);
              }}
              options={WORKSPACE_KINDS}
              labels={WORKSPACE_KIND_LABELS}
            />
          </Field>
          {!editing && STARTER_FOLDERS[kind] ? (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={starter} onCheckedChange={(v) => setStarter(v === true)} className="mt-0.5" />
              <span>
                Add starter folders
                <span className="block text-xs text-muted-foreground">{STARTER_FOLDERS[kind]!.join(", ")}</span>
              </span>
            </label>
          ) : null}
          <Field label="Icon">
            <IconPicker
              value={icon}
              color={color}
              onChange={(v) => {
                setIcon(v);
                setIconTouched(true);
              }}
            />
          </Field>
          <Field label="Accent colour">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {editing ? "Save" : "Create workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
