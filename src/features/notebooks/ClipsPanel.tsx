import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Code2, ImagePlus, Link2, Loader2, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { Attachment, CodeSnippet, Resource } from "@shared/types";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useAttachments, useCreate, useList, useUpload } from "@/lib/queries";
import { AddLinkForm } from "./AddLinkForm";
import { insertCode, insertImage, insertLink, screenToScene, type ScenePoint } from "@/features/diagrams/notebook";

/** Something from the folder that can be placed on the board. */
type Clip = { kind: "image"; item: Attachment } | { kind: "code"; item: CodeSnippet } | { kind: "link"; item: Resource };

const DRAG_TYPE = "application/x-devspace-clip";
/** Longest side of a screenshot placed on the board: sharp in the PDF, light in the saved board. */
const MAX_IMAGE_SIDE = 1800;

async function imageToDataURL(url: string): Promise<{ dataURL: string; width: number; height: number }> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Couldn't load the image (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { dataURL: canvas.toDataURL("image/webp", 0.92), width, height };
}

async function placeClip(api: ExcalidrawImperativeAPI, clip: Clip, at?: ScenePoint) {
  if (clip.kind === "image") {
    const img = await imageToDataURL(clip.item.url);
    insertImage(api, img.dataURL, img, at);
  } else if (clip.kind === "code") {
    insertCode(api, clip.item.code, { title: clip.item.title, language: clip.item.language, at });
  } else {
    insertLink(api, clip.item.url, { title: clip.item.title, at });
  }
}

/**
 * The folder's screenshots, code snippets and links beside the board. Click one to add it
 * below your writing on the page in view, or drag it to a spot on the page.
 */
export function ClipsPanel({
  getApi,
  dropTarget,
  workspaceId,
  folderId,
  onClose,
}: {
  getApi: () => ExcalidrawImperativeAPI | null;
  /** The element around the board, which accepts clips dragged from the panel. */
  dropTarget: React.RefObject<HTMLElement | null>;
  workspaceId: string;
  folderId: string;
  onClose: () => void;
}) {
  const scope = { workspaceId, folderId };
  const files = useAttachments(scope);
  const snippets = useList("snippets", scope);
  const links = useList("resources", scope);
  const upload = useUpload();
  const createLink = useCreate("resources");
  const [busy, setBusy] = useState<string | null>(null);
  const dragging = useRef<Clip | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const images = (files.data ?? []).filter((a) => a.kind === "image" && a.label !== "banner" && !a.diagramId);

  const place = async (clip: Clip, at?: ScenePoint) => {
    const api = getApi();
    if (!api) return;
    setBusy(clip.item.id);
    try {
      await placeClip(api, clip, at);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  // Accept clips dropped onto the board, ahead of Excalidraw's own drop handling.
  useEffect(() => {
    const el = dropTarget.current;
    if (!el) return;
    const isClip = (e: DragEvent) => !!dragging.current && !!e.dataTransfer?.types.includes(DRAG_TYPE);
    const over = (e: DragEvent) => {
      if (!isClip(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer!.dropEffect = "copy";
    };
    const drop = (e: DragEvent) => {
      if (!isClip(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const api = getApi();
      const clip = dragging.current!;
      dragging.current = null;
      if (api) void placeRef.current(clip, screenToScene(api, e.clientX, e.clientY));
    };
    el.addEventListener("dragover", over, true);
    el.addEventListener("drop", drop, true);
    return () => {
      el.removeEventListener("dragover", over, true);
      el.removeEventListener("drop", drop, true);
    };
  }, [dropTarget, getApi]);

  const dragProps = (clip: Clip) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      dragging.current = clip;
      e.dataTransfer.setData(DRAG_TYPE, clip.item.id);
      e.dataTransfer.effectAllowed = "copy";
    },
    onDragEnd: () => {
      dragging.current = null;
    },
    onClick: () => void place(clip),
    title: "Click to add below your writing, or drag onto the page",
  });

  const addScreenshots = async (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) {
      const att = await upload.mutateAsync({ file, target: { workspaceId, folderId } }).catch(() => null);
      if (att) await place({ kind: "image", item: att });
    }
  };

  const loading = files.isLoading || snippets.isLoading || links.isLoading;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l bg-card" aria-label="Folder clips">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <p className="text-sm font-semibold">Clips</p>
          <p className="text-[11px] text-muted-foreground">Click to add · drag to place</p>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Hide clips">
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        {loading ? <Loader2 className="mx-auto mt-6 size-4 animate-spin text-muted-foreground" /> : null}

        <ClipSection
          icon={<ImagePlus className="size-3.5" />}
          title="Screenshots"
          count={images.length}
          action={
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Add
            </Button>
          }
          empty="Paste a screenshot onto the board with Ctrl+V, or add one here to keep it in this folder."
        >
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void addScreenshots(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            {images.map((a) => (
              <button
                key={a.id}
                type="button"
                {...dragProps({ kind: "image", item: a })}
                className="group relative aspect-[4/3] overflow-hidden rounded-md border bg-muted/40 hover:ring-2 hover:ring-primary"
              >
                <img src={a.url} alt={a.fileName} draggable={false} loading="lazy" className="size-full object-cover" />
                {busy === a.id ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <Loader2 className="size-4 animate-spin" />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </ClipSection>

        <ClipSection icon={<Code2 className="size-3.5" />} title="Code" count={snippets.data?.length ?? 0} empty="No code snippets in this folder yet.">
          <div className="space-y-2">
            {(snippets.data ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                {...dragProps({ kind: "code", item: s })}
                className="block w-full rounded-md border bg-muted/40 p-2 text-left hover:border-primary"
              >
                <span className="flex items-center justify-between gap-2 text-xs font-medium">
                  <span className="truncate">{s.title}</span>
                  {busy === s.id ? <Loader2 className="size-3 animate-spin" /> : <span className="shrink-0 text-[10px] text-muted-foreground">{s.language}</span>}
                </span>
                <pre className="mt-1 max-h-24 overflow-hidden font-mono text-[10px] leading-snug text-muted-foreground">{s.code.split("\n").slice(0, 7).join("\n")}</pre>
              </button>
            ))}
          </div>
        </ClipSection>

        <ClipSection icon={<Link2 className="size-3.5" />} title="Links" count={links.data?.length ?? 0} empty="">
          <AddLinkForm
            pending={createLink.isPending}
            onAdd={async (url) => {
              let title = url;
              try {
                title = new URL(url).hostname.replace(/^www\./, "");
              } catch {
                /* the server validates the address */
              }
              const r = await createLink.mutateAsync({ workspaceId, folderId, title, url }).catch(() => null);
              if (r) await place({ kind: "link", item: r });
              return !!r;
            }}
          />
          <div className="space-y-1">
            {(links.data ?? []).map((r) => (
              <button
                key={r.id}
                type="button"
                {...dragProps({ kind: "link", item: r })}
                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
              >
                <span className="block truncate text-xs font-medium text-primary">{r.title}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{r.url.replace(/^https?:\/\//, "")}</span>
              </button>
            ))}
          </div>
        </ClipSection>
      </div>
    </aside>
  );
}

function ClipSection({ icon, title, count, action, empty, children }: { icon: ReactNode; title: string; count: number; action?: ReactNode; empty: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {icon} {title} {count ? <span className="font-normal">({count})</span> : null}
        </h3>
        {action}
      </div>
      {count === 0 && empty ? <p className="mb-2 text-[11px] text-muted-foreground">{empty}</p> : null}
      {children}
    </section>
  );
}
