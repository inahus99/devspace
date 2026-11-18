import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  RESOURCE_STATUS_LABELS,
  RESOURCE_STATUSES,
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPES,
  type ResourceStatus,
  type ResourceType,
} from "@shared/constants";
import { isHttpUrl } from "@shared/schemas";
import type { Resource } from "@shared/types";
import { detectResourceType, suggestTitleFromUrl } from "@shared/url";
import { type CaptureDialogProps, str } from "@/components/common/capture";
import { EnumSelect, Field, FolderSelect, TagInput, WorkspaceSelect } from "@/components/common/fields";
import { AutoTextarea } from "@/components/common/Markdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreate, useUpdate } from "@/lib/queries";

interface FormState {
  url: string;
  title: string;
  description: string;
  type: ResourceType;
  status: ResourceStatus;
  workspaceId: string | null;
  folderId: string | null;
  tags: string[];
}

function initial(defaults?: Record<string, unknown>, resource?: Resource): FormState {
  if (resource) {
    return {
      url: resource.url,
      title: resource.title,
      description: resource.description,
      type: resource.type,
      status: resource.status,
      workspaceId: resource.workspaceId,
      folderId: resource.folderId,
      tags: resource.tags,
    };
  }
  const url = str(defaults?.url) ?? "";
  return {
    url,
    title: str(defaults?.title) ?? "",
    description: "",
    type: url ? detectResourceType(url) : "other",
    status: "unread",
    workspaceId: str(defaults?.workspaceId) ?? null,
    folderId: str(defaults?.folderId) ?? null,
    tags: [],
  };
}

export function ResourceDialog({ open, onOpenChange, defaults, resource }: CaptureDialogProps & { resource?: Resource }) {
  const [form, setForm] = useState<FormState>(() => initial(defaults, resource));
  const [titleTouched, setTitleTouched] = useState(!!resource);
  const [typeTouched, setTypeTouched] = useState(!!resource);
  const [error, setError] = useState<string | null>(null);
  const create = useCreate("resources");
  const update = useUpdate("resources");
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(initial(defaults, resource));
      setTitleTouched(!!resource);
      setTypeTouched(!!resource);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resource?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onUrl = (raw: string) => {
    const url = raw.trim();
    setError(null);
    setForm((f) => ({
      ...f,
      url: raw,
      type: typeTouched || !isHttpUrl(url) ? f.type : detectResourceType(url),
      title: titleTouched || !isHttpUrl(url) ? f.title : suggestTitleFromUrl(url),
    }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const url = form.url.trim();
    if (!isHttpUrl(url)) {
      setError("Enter a valid http(s) URL");
      urlRef.current?.focus();
      return;
    }
    const title = form.title.trim() || suggestTitleFromUrl(url) || url;
    const payload = {
      url,
      title,
      description: form.description,
      type: form.type,
      status: form.status,
      workspaceId: form.workspaceId,
      folderId: form.workspaceId ? form.folderId : null,
      tags: form.tags,
    };
    try {
      if (resource) {
        await update.mutateAsync({ id: resource.id, ...payload });
        toast.success("Resource updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Resource saved to library");
      }
      onOpenChange(false);
    } catch {
      /* toast shown by hook */
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{resource ? "Edit resource" : "Save a resource"}</DialogTitle>
            <DialogDescription>Paste a link — type and title are detected from the URL.</DialogDescription>
          </DialogHeader>

          <Field label="URL" htmlFor="res-url" error={error}>
            <Input
              id="res-url"
              ref={urlRef}
              autoFocus
              inputMode="url"
              placeholder="https://…"
              value={form.url}
              onChange={(e) => onUrl(e.target.value)}
              aria-invalid={!!error}
            />
          </Field>
          <Field label="Title" htmlFor="res-title">
            <Input
              id="res-title"
              value={form.title}
              placeholder="Detected from the URL"
              onChange={(e) => {
                setTitleTouched(true);
                set("title", e.target.value);
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <EnumSelect
                value={form.type}
                options={RESOURCE_TYPES}
                labels={RESOURCE_TYPE_LABELS}
                onChange={(v) => {
                  setTypeTouched(true);
                  if (v) set("type", v);
                }}
              />
            </Field>
            <Field label="Status">
              <EnumSelect value={form.status} options={RESOURCE_STATUSES} labels={RESOURCE_STATUS_LABELS} onChange={(v) => v && set("status", v)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Workspace">
              <WorkspaceSelect
                value={form.workspaceId}
                allowNone
                noneLabel="Library only"
                onChange={(v) => setForm((f) => ({ ...f, workspaceId: v, folderId: null }))}
              />
            </Field>
            <Field label="Folder">
              <FolderSelect workspaceId={form.workspaceId} value={form.folderId} onChange={(v) => set("folderId", v)} rootLabel="No folder" />
            </Field>
          </div>
          <Field label="Description" htmlFor="res-desc">
            <AutoTextarea id="res-desc" value={form.description} onChange={(v) => set("description", v)} minRows={2} placeholder="Why is this worth keeping?" />
          </Field>
          <Field label="Tags">
            <TagInput value={form.tags} onChange={(v) => set("tags", v)} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {resource ? "Save changes" : "Save resource"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
