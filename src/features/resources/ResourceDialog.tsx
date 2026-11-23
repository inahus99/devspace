import { ImagePlus, X } from "lucide-react";
import { type ClipboardEvent, type FormEvent, useEffect, useRef, useState } from "react";
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
import { useCreate, useUpdate, useUpload } from "@/lib/queries";
import { useLinkImages } from "./LinkNote";

type PendingImage = { id: string; file: File; preview: string };

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
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUpload();
  const saved = useLinkImages(resource?.id ?? "");
  // Images added before saving; they upload once the link exists.
  const [images, setImages] = useState<PendingImage[]>([]);
  const clearImages = () =>
    setImages((list) => {
      for (const i of list) URL.revokeObjectURL(i.preview);
      return [];
    });
  const addImages = (files: File[]) => {
    const add = files.filter((f) => f.type.startsWith("image/")).map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
    if (add.length) setImages((list) => [...list, ...add]);
  };
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return; // ordinary text paste
    e.preventDefault();
    addImages(files);
  };

  useEffect(() => {
    if (open) {
      setForm(initial(defaults, resource));
      setTitleTouched(!!resource);
      setTypeTouched(!!resource);
      setError(null);
      clearImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resource?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => clearImages, []);

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
      const row = resource ? await update.mutateAsync({ id: resource.id, ...payload }) : await create.mutateAsync(payload);
      for (const img of images) await upload.mutateAsync({ file: img.file, target: { resourceId: row.id } }).catch(() => null);
      toast.success(resource ? "Resource updated" : "Resource saved to library");
      clearImages();
      onOpenChange(false);
    } catch {
      /* toast shown by hook */
    }
  };

  const pending = create.isPending || update.isPending || upload.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} onPaste={onPaste} className="grid gap-4">
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
          <Field label="Note" htmlFor="res-desc">
            <AutoTextarea
              id="res-desc"
              value={form.description}
              onChange={(v) => set("description", v)}
              minRows={2}
              placeholder="Why is this worth keeping? Paste a screenshot here too (Ctrl+V)."
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addImages([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {saved.map((a) => (
                <img key={a.id} src={a.url} alt="" className="size-14 rounded-md border object-cover" />
              ))}
              {images.map((img) => (
                <span key={img.id} className="relative">
                  <img src={img.preview} alt="" className="size-14 rounded-md border object-cover" />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() =>
                      setImages((list) => {
                        URL.revokeObjectURL(img.preview);
                        return list.filter((i) => i.id !== img.id);
                      })
                    }
                    className="absolute -top-1.5 -right-1.5 rounded-full border bg-background p-0.5 text-muted-foreground shadow-sm hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => fileRef.current?.click()}>
                <ImagePlus /> Add image
              </Button>
            </div>
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
