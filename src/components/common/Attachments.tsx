import { ChevronLeft, ChevronRight, Download, FileText, ImageIcon, Maximize2, Paperclip, Trash2, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import { type DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Attachment } from "@shared/types";
import { Button } from "@/components/ui/button";
import { type UploadTarget, useAttachments, useDeleteAttachment, useUpload } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { confirm } from "./ConfirmDialog";
import { Spinner } from "./states";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------

export function Lightbox({
  images,
  index,
  onClose,
  onIndex,
}: {
  images: { src: string; alt?: string }[];
  index: number;
  onClose: () => void;
  onIndex?: (i: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const ref = useRef<HTMLDivElement>(null);
  const img = images[index];

  useEffect(() => setZoom(1), [index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && onIndex && index < images.length - 1) onIndex(index + 1);
      else if (e.key === "ArrowLeft" && onIndex && index > 0) onIndex(index - 1);
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.25, 5));
      else if (e.key === "-") setZoom((z) => Math.max(z - 0.25, 0.25));
      else if (e.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onIndex]);

  if (!img) return null;
  return createPortal(
    <div ref={ref} className="fixed inset-0 z-[100] flex flex-col bg-black/90 text-white" role="dialog" aria-modal="true" aria-label="Image viewer">
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
        <span className="truncate text-white/70">
          {img.alt} {images.length > 1 ? `· ${index + 1} / ${images.length}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <LbButton label="Zoom out" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}>
            <ZoomOut className="size-4" />
          </LbButton>
          <button type="button" className="w-12 text-center text-xs text-white/70 tabular" onClick={() => setZoom(1)} title="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <LbButton label="Zoom in" onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}>
            <ZoomIn className="size-4" />
          </LbButton>
          <LbButton label="Full screen" onClick={() => void ref.current?.requestFullscreen?.()}>
            <Maximize2 className="size-4" />
          </LbButton>
          <a href={`${img.src}?download=1`} className="rounded p-2 hover:bg-white/10" aria-label="Download" title="Download">
            <Download className="size-4" />
          </a>
          <LbButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </LbButton>
        </div>
      </div>
      <div
        className="relative flex flex-1 items-center justify-center overflow-auto"
        onClick={(e) => e.target === e.currentTarget && onClose()}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoom((z) => Math.min(Math.max(z - e.deltaY * 0.002, 0.25), 5));
          }
        }}
      >
        <img
          src={img.src}
          alt={img.alt ?? ""}
          className="max-h-full max-w-full object-contain transition-transform duration-100"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
          draggable={false}
        />
        {onIndex && index > 0 ? (
          <button type="button" onClick={() => onIndex(index - 1)} className="absolute left-3 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Previous">
            <ChevronLeft className="size-5" />
          </button>
        ) : null}
        {onIndex && index < images.length - 1 ? (
          <button type="button" onClick={() => onIndex(index + 1)} className="absolute right-3 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Next">
            <ChevronRight className="size-5" />
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function LbButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded p-2 hover:bg-white/10" aria-label={label} title={label}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Upload helpers
// ---------------------------------------------------------------------------

/** Accepts files via drop, paste (when focused/hovered region) or picker. */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const counter = useRef(0);
  const handlers = {
    onDragEnter: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      counter.current++;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) e.preventDefault();
    },
    onDragLeave: () => {
      counter.current = Math.max(0, counter.current - 1);
      if (counter.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      counter.current = 0;
      setDragging(false);
      onFiles(Array.from(e.dataTransfer.files));
    },
  };
  return { dragging, handlers };
}

// ---------------------------------------------------------------------------
// Attachments panel (gallery + file list + upload)
// ---------------------------------------------------------------------------

/**
 * Screenshots, diagrams and files attached to an item.
 * Supports drag-and-drop, Ctrl/Cmd+V paste while hovered/focused, multiple images,
 * previews, zoom/fullscreen, download, replace and delete.
 */
export function AttachmentsPanel({
  target,
  query,
  title = "Attachments",
  emptyHint = "Drop files here, paste a screenshot, or click Upload.",
  className,
  standalone,
  gallery,
}: {
  /** Where new uploads go. */
  target: UploadTarget;
  /** Which attachments to list (defaults to the target). */
  query?: Record<string, string | undefined>;
  title?: string;
  emptyHint?: string;
  className?: string;
  /** Workspace "Files" mode: only standalone files. */
  standalone?: boolean;
  /** Show images large (one per row, or two side by side) — for reference screenshots. */
  gallery?: boolean;
}) {
  const params = { ...(query ?? (target as Record<string, string | undefined>)), standalone: standalone ? "1" : undefined };
  const { data, isLoading } = useAttachments(params);
  const upload = useUpload();
  const del = useDeleteAttachment();
  const [busy, setBusy] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<{ input: HTMLInputElement | null; target: Attachment | null }>({ input: null, target: null });
  const [hovered, setHovered] = useState(false);

  const uploadAll = useCallback(
    async (files: File[]) => {
      setBusy((b) => b + files.length);
      for (const file of files) {
        try {
          await upload.mutateAsync({ file, target });
        } catch {
          /* toast shown by hook */
        } finally {
          setBusy((b) => b - 1);
        }
      }
    },
    [target, upload],
  );

  const { dragging, handlers } = useFileDrop((files) => void uploadAll(files));

  // Paste screenshots while the panel is hovered.
  useEffect(() => {
    if (!hovered) return;
    const onPaste = (e: ClipboardEvent) => {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as HTMLElement).isContentEditable)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      void uploadAll(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [hovered, uploadAll]);

  const images = (data ?? []).filter((a) => a.kind === "image");
  const files = (data ?? []).filter((a) => a.kind !== "image");

  const remove = async (a: Attachment) => {
    if (await confirm({ title: `Delete ${a.fileName}?`, description: "The file will be permanently removed.", destructive: true })) {
      del.mutate(a.id);
    }
  };
  const replace = async (a: Attachment, file: File) => {
    try {
      await upload.mutateAsync({ file, target: { ...target, label: a.label } });
      del.mutate(a.id);
    } catch {
      /* toast shown */
    }
  };

  return (
    <section
      className={cn("rounded-xl border bg-card shadow-soft", dragging && "ring-2 ring-brand", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...handlers}
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="size-3.5 text-muted-foreground" />
          {title}
          {data?.length ? <span className="text-xs font-normal text-muted-foreground">{data.length}</span> : null}
          {busy > 0 ? <Spinner className="size-3.5" /> : null}
        </h3>
        <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
          <Upload /> Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (list.length) void uploadAll(list);
          }}
        />
        <input
          ref={(el) => {
            replaceRef.current.input = el;
          }}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f && replaceRef.current.target) void replace(replaceRef.current.target, f);
          }}
        />
      </header>
      <div className="p-3">
        {isLoading ? (
          <Spinner />
        ) : !data?.length ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-1 rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground hover:bg-accent/50"
          >
            <ImageIcon className="size-4" />
            {emptyHint}
          </button>
        ) : (
          <div className="space-y-3">
            {images.length > 0 ? (
              <div className={cn("grid gap-2", gallery ? (images.length > 1 ? "gap-3 md:grid-cols-2" : "") : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4")}>
                {images.map((a, i) => (
                  <figure key={a.id} className="group relative overflow-hidden rounded-md border bg-muted/40">
                    <button
                      type="button"
                      onClick={() => setViewer(i)}
                      className={cn("block w-full", gallery ? "bg-muted/30" : "aspect-video")}
                      aria-label={`View ${a.fileName}`}
                    >
                      <img
                        src={a.url}
                        alt={a.fileName}
                        loading="lazy"
                        className={cn(gallery ? "mx-auto max-h-[560px] w-auto max-w-full object-contain" : "size-full object-cover")}
                      />
                    </button>
                    <figcaption className="flex items-center justify-between gap-1 px-2 py-1 text-2xs text-muted-foreground">
                      <span className="truncate">{a.label || a.fileName}</span>
                    </figcaption>
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <IconBtn label="Replace" onClick={() => {
                        replaceRef.current.target = a;
                        replaceRef.current.input?.click();
                      }}>
                        <Upload className="size-3" />
                      </IconBtn>
                      <IconBtn label="Delete" onClick={() => void remove(a)}>
                        <Trash2 className="size-3" />
                      </IconBtn>
                    </div>
                  </figure>
                ))}
              </div>
            ) : null}
            {files.length > 0 ? (
              <ul className="divide-y rounded-md border">
                {files.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                      {a.fileName}
                    </a>
                    <span className="text-xs text-muted-foreground tabular">{formatBytes(a.sizeBytes)}</span>
                    <a href={`${a.url}?download=1`} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Download">
                      <Download className="size-3.5" />
                    </a>
                    <button type="button" onClick={() => void remove(a)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive" aria-label="Delete">
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-2xs text-muted-foreground">{emptyHint}</p>
          </div>
        )}
      </div>
      {viewer !== null ? (
        <Lightbox images={images.map((a) => ({ src: a.url, alt: a.fileName }))} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      ) : null}
    </section>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded bg-background/90 p-1 text-foreground shadow-sm backdrop-blur hover:bg-background"
    >
      {children}
    </button>
  );
}
