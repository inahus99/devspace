import { Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { LanguageId } from "@shared/constants";
import { snippetCreateSchema } from "@shared/schemas";
import { type CaptureDialogProps, str } from "@/components/common/capture";
import { Field, FolderSelect, TagInput, WorkspaceSelect } from "@/components/common/fields";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreate, useWorkspaces } from "@/lib/queries";
import { routes } from "@/lib/routes";

export function SnippetDialog({ open, onOpenChange, defaults }: CaptureDialogProps) {
  const { data: workspaces } = useWorkspaces();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<LanguageId>("typescript");
  const [code, setCode] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreate("snippets");
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setWorkspaceId(str(defaults?.workspaceId) ?? workspaces?.find((w) => !w.archivedAt)?.id ?? null);
    setFolderId(str(defaults?.folderId) ?? null);
    setTitle(str(defaults?.title) ?? "");
    setDescription("");
    setLanguage((str(defaults?.language) as LanguageId | undefined) ?? "typescript");
    setCode(str(defaults?.code) ?? "");
    setTags([]);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = snippetCreateSchema.safeParse({
      workspaceId: workspaceId ?? "",
      folderId,
      title,
      description,
      language,
      code,
      tags,
      noteId: str(defaults?.noteId) ?? null,
      dsaProblemId: str(defaults?.dsaProblemId) ?? null,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.path[0] === "workspaceId" ? "Choose a workspace" : i.message])));
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: (s) => {
        onOpenChange(false);
        navigate(routes.snippet(s.id));
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>New code snippet</DialogTitle>
          </DialogHeader>
          <Field label="Title" htmlFor="snip-title" error={errors.title}>
            <Input id="snip-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Binary search template" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Workspace" error={errors.workspaceId}>
              <WorkspaceSelect
                value={workspaceId}
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
          <Field label="Description" htmlFor="snip-desc">
            <Input id="snip-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </Field>
          <CodeEditor value={code} onChange={setCode} language={language} onLanguageChange={(v) => setLanguage(v as LanguageId)} height={220} />
          <Field label="Tags">
            <TagInput value={tags} onChange={setTags} />
          </Field>
          {defaults?.noteId || defaults?.dsaProblemId ? (
            <p className="text-xs text-muted-foreground">This snippet will be linked to the {defaults?.noteId ? "note" : "DSA problem"} you came from.</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : null}
              Save snippet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
