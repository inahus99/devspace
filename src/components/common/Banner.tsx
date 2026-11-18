import { ImagePlus, Link2, Loader2, Move, Trash2, Upload } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isHttpUrl } from "@shared/schemas";
import { useFileDrop } from "@/components/common/Attachments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { uploadFile, type UploadTarget } from "@/lib/queries";
import { cn } from "@/lib/utils";

export interface BannerPatch {
  bannerUrl?: string | null;
  bannerPosition?: number;
}

interface BannerProps {
  url: string | null | undefined;
  /** Vertical focal point 0–100. */
  position: number;
  /** Where an uploaded image is stored (workspace/folder); tagged as a banner so it stays out of file lists. */
  uploadTarget: Omit<UploadTarget, "label">;
  onChange: (patch: BannerPatch) => Promise<unknown>;
  /** Used in alt text and button labels, e.g. the workspace or folder name. */
  name: string;
  /** Tiny label shown on the banner, e.g. "Folder" (optional). */
  eyebrow?: string;
  className?: string;
}

const MAX_BANNER_MB = 15;

/**
 * Header banner for a workspace or top-level folder: upload, paste or drop an image, use a URL,
 * drag to reposition, or remove. Without an image it collapses to a quiet "Add banner" control.
 */
export function Banner({ url, position, uploadTarget, onChange, name, eyebrow, className }: BannerProps) {
  const [busy, setBusy] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [repositioning, setRepositioning] = useState(false);
  const [draftPos, setDraftPos] = useState(position);
  const [broken, setBroken] = useState(false);
  const [hovered, setHovered] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; pos: number } | null>(null);

  useEffect(() => setDraftPos(position), [position]);
  useEffect(() => setBroken(false), [url]);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Banners must be images");
    if (file.size > MAX_BANNER_MB * 1024 * 1024) return void toast.error(`Images up to ${MAX_BANNER_MB} MB`);
    setBusy(true);
    try {
      const att = await uploadFile(file, { ...uploadTarget, label: "banner" });
      await onChange({ bannerUrl: `/api/files/${att.id}`, bannerPosition: 50 });
    } catch (err) {
      toast.error(`Couldn't set banner: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await onChange({ bannerUrl: null });
    } finally {
      setBusy(false);
    }
  }

  const { dragging, handlers } = useFileDrop((files) => void upload(files.find((f) => f.type.startsWith("image/"))));

  // Paste an image while hovering the banner area.
  useEffect(() => {
    if (!hovered) return;
    const onPaste = (e: ClipboardEvent) => {
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      void upload(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!repositioning) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, pos: draftPos };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || !frame.current) return;
    // Dragging the image down reveals more of its top, so the focal point moves up.
    const dy = e.clientY - drag.current.y;
    const next = drag.current.pos - (dy / frame.current.clientHeight) * 100;
    setDraftPos(Math.round(Math.min(100, Math.max(0, next))));
  }
  function endDrag() {
    drag.current = null;
  }
  async function saveReposition() {
    setRepositioning(false);
    if (draftPos !== position) await onChange({ bannerPosition: draftPos });
  }

  const picker = (
    <input
      ref={fileInput}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        void upload(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  const urlDialog = (
    <BannerUrlDialog
      open={urlOpen}
      onOpenChange={setUrlOpen}
      onSubmit={async (u) => {
        await onChange({ bannerUrl: u, bannerPosition: 50 });
        setUrlOpen(false);
      }}
    />
  );
  const changeMenu = (label: string, icon: ReactNode, variant: "overlay" | "quiet") => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant={variant === "overlay" ? "secondary" : "ghost"}
          disabled={busy}
          className={cn(variant === "overlay" ? "h-7 bg-background/85 backdrop-blur hover:bg-background" : "h-7 text-muted-foreground")}
        >
          {busy ? <Loader2 className="animate-spin" /> : icon} {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
          <Upload /> Upload image
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setUrlOpen(true)}>
          <Link2 /> Use image URL
        </DropdownMenuItem>
        <p className="px-2 pt-1 pb-1.5 text-2xs text-muted-foreground">Or drop / paste an image here</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!url) {
    return (
      <div
        className={cn(
          "group relative flex h-9 items-center justify-end rounded-lg border border-dashed border-transparent transition-colors",
          dragging && "h-28 border-brand bg-brand-soft",
          hovered && !dragging && "border-border",
          className,
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        {...handlers}
      >
        {dragging ? (
          <span className="absolute inset-0 grid place-items-center text-sm text-brand">Drop to set the banner</span>
        ) : (
          <div className={cn("transition-opacity", hovered || busy ? "opacity-100" : "opacity-60")}>
            {changeMenu("Add banner", <ImagePlus />, "quiet")}
          </div>
        )}
        {picker}
        {urlDialog}
      </div>
    );
  }

  return (
    <div
      ref={frame}
      className={cn("group relative h-36 overflow-hidden rounded-xl border bg-muted sm:h-48", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...handlers}
    >
      {broken ? (
        <div className="grid h-full place-items-center text-sm text-muted-foreground">Banner image couldn't be loaded</div>
      ) : (
        <img
          src={url}
          alt={`${name} banner`}
          draggable={false}
          onError={() => setBroken(true)}
          className={cn("size-full object-cover select-none", repositioning && "cursor-grab active:cursor-grabbing")}
          style={{ objectPosition: `50% ${repositioning ? draftPos : position}%` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      )}
      {/* A soft ink wash at the bottom keeps overlaid text legible on any image. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/35 to-transparent" />
      {eyebrow ? (
        <span className="pointer-events-none absolute bottom-3 left-4 font-mono text-2xs tracking-[0.2em] text-white/90 uppercase">{eyebrow}</span>
      ) : null}

      {dragging ? <div className="absolute inset-0 grid place-items-center bg-brand/60 text-sm font-medium text-white">Drop to replace the banner</div> : null}

      {repositioning ? (
        <>
          <span className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-black/55 px-2.5 py-1 text-xs text-white">
            Drag the image to reposition
          </span>
          <div className="absolute right-3 bottom-3 flex gap-1.5">
            <Button size="sm" variant="secondary" className="h-7" onClick={() => (setDraftPos(position), setRepositioning(false))}>
              Cancel
            </Button>
            <Button size="sm" className="h-7" onClick={() => void saveReposition()}>
              Save position
            </Button>
          </div>
        </>
      ) : (
        <div
          className={cn(
            "absolute right-3 bottom-3 flex gap-1.5 transition-opacity",
            hovered || busy ? "opacity-100" : "opacity-100 sm:opacity-0",
          )}
        >
          {changeMenu("Change", <ImagePlus />, "overlay")}
          {!broken ? (
            <Button size="sm" variant="secondary" className="h-7 bg-background/85 backdrop-blur hover:bg-background" onClick={() => setRepositioning(true)}>
              <Move /> Reposition
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            className="h-7 bg-background/85 backdrop-blur hover:bg-background"
            disabled={busy}
            onClick={() => void remove()}
            aria-label="Remove banner"
          >
            <Trash2 />
          </Button>
        </div>
      )}
      {picker}
      {urlDialog}
    </div>
  );
}

function BannerUrlDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (url: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setValue("");
  }, [open]);
  const valid = isHttpUrl(value.trim());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Banner from URL</DialogTitle>
          <DialogDescription>Paste a direct link to an image (https). It's loaded from that site, so it can disappear if they remove it — uploading keeps a copy.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            setSaving(true);
            try {
              await onSubmit(value.trim());
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setSaving(false);
            }
          }}
          className="space-y-4"
        >
          <Input autoFocus placeholder="https://images.example.com/photo.jpg" value={value} onChange={(e) => setValue(e.target.value)} />
          {valid ? (
            <img src={value.trim()} alt="Preview" className="h-28 w-full rounded-md border object-cover" onError={(e) => (e.currentTarget.style.display = "none")} onLoad={(e) => (e.currentTarget.style.display = "")} />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving ? <Loader2 className="animate-spin" /> : null} Set banner
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
