import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  DSA_DIFFICULTIES,
  DSA_DIFFICULTY_LABELS,
  DSA_PLATFORMS,
  DSA_STATUS_LABELS,
  DSA_STATUSES,
  DSA_TOPICS,
  type DsaDifficulty,
  type DsaStatus,
} from "@shared/constants";
import { dsaProblemCreateSchema } from "@shared/schemas";
import { type CaptureDialogProps, str } from "@/components/common/capture";
import { EnumSelect, Field, FolderSelect, TagInput, WorkspaceSelect } from "@/components/common/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreate, useWorkspaces } from "@/lib/queries";
import { routes } from "@/lib/routes";

type Errors = Partial<Record<"title" | "workspaceId" | "url", string>>;

export function DsaProblemDialog({ open, onOpenChange, defaults }: CaptureDialogProps) {
  const navigate = useNavigate();
  const create = useCreate("dsa");
  const { data: workspaces } = useWorkspaces();
  const defaultWs = useMemo(() => {
    const fromDefaults = str(defaults?.workspaceId);
    if (fromDefaults) return fromDefaults;
    const active = (workspaces ?? []).filter((w) => !w.archivedAt);
    return (active.find((w) => w.kind === "dsa") ?? active[0])?.id ?? null;
  }, [defaults, workspaces]);

  const [title, setTitle] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(defaultWs);
  const [folderId, setFolderId] = useState<string | null>(str(defaults?.folderId) ?? null);
  const [platform, setPlatform] = useState<string>("LeetCode");
  const [url, setUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<DsaDifficulty>("medium");
  const [status, setStatus] = useState<DsaStatus>("todo");
  const [tags, setTags] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});

  // Reset each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTitle(str(defaults?.title) ?? "");
    setWorkspaceId(defaultWs);
    setFolderId(str(defaults?.folderId) ?? null);
    setPlatform("LeetCode");
    setUrl("");
    setTopic(str(defaults?.topic) ?? "");
    setDifficulty("medium");
    setStatus("todo");
    setTags([]);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && !workspaceId && defaultWs) setWorkspaceId(defaultWs);
  }, [open, workspaceId, defaultWs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      workspaceId: workspaceId ?? "",
      folderId,
      title,
      platform,
      url: url.trim(),
      topic: topic.trim(),
      difficulty,
      status,
      tags,
    };
    const parsed = dsaProblemCreateSchema.safeParse(input);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "title") next.title = "Give the problem a title";
        else if (key === "workspaceId") next.workspaceId = "Choose a workspace";
        else if (key === "url") next.url = issue.message;
      }
      setErrors(next);
      return;
    }
    try {
      const row = await create.mutateAsync(parsed.data);
      onOpenChange(false);
      navigate(routes.dsa(row.id));
    } catch {
      /* toast shown by hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>New DSA problem</DialogTitle>
            <DialogDescription>Capture the problem now — add approach and solutions on the next screen.</DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor="dsa-title" error={errors.title}>
            <Input id="dsa-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Container With Most Water" autoFocus aria-invalid={!!errors.title} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Workspace" error={errors.workspaceId}>
              <WorkspaceSelect
                value={workspaceId}
                kinds={["dsa"]}
                onChange={(v) => {
                  setWorkspaceId(v);
                  setFolderId(null);
                }}
              />
            </Field>
            <Field label="Folder">
              <FolderSelect workspaceId={workspaceId} value={folderId} onChange={setFolderId} rootLabel="No folder" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Platform">
              <EnumSelect value={platform as (typeof DSA_PLATFORMS)[number]} onChange={(v) => setPlatform(v ?? "")} options={DSA_PLATFORMS} />
            </Field>
            <Field label="Topic" htmlFor="dsa-topic">
              <Input id="dsa-topic" list="dsa-topic-options" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Two Pointers" />
              <datalist id="dsa-topic-options">
                {DSA_TOPICS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field label="Problem URL" htmlFor="dsa-url" error={errors.url}>
            <Input id="dsa-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://leetcode.com/problems/…" aria-invalid={!!errors.url} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Difficulty">
              <EnumSelect value={difficulty} onChange={(v) => v && setDifficulty(v)} options={DSA_DIFFICULTIES} labels={DSA_DIFFICULTY_LABELS} />
            </Field>
            <Field label="Status">
              <EnumSelect value={status} onChange={(v) => v && setStatus(v)} options={DSA_STATUSES} labels={DSA_STATUS_LABELS} />
            </Field>
          </div>
          <Field label="Tags">
            <TagInput value={tags} onChange={setTags} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create problem"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
