import { ExternalLink, ImagePlus, Loader2, Pencil, Plus, StickyNote, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Attachment, Resource } from "@shared/types";
import { hostOf } from "@shared/url";
import { confirm } from "@/components/common/ConfirmDialog";
import { InlineNoteEditor } from "@/components/common/InlineNoteEditor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAttachments, useDeleteAttachment, useUpdate, useUpload } from "@/lib/queries";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "Why it's useful, which part to read, what you took from it…";

/** Images in every link's note. One request for the whole page; each card picks its own. */
export function useLinkImages(resourceId: string): Attachment[] {
  const { data } = useAttachments({ forResources: "1" });
  return useMemo(() => (data ?? []).filter((a) => a.resourceId === resourceId && a.kind === "image"), [data, resourceId]);
}

/** Upload images into a link's note, from a file picker or a paste. */
function useAddImages(resourceId: string) {
  const upload = useUpload();
  const input = useRef<HTMLInputElement>(null);
  const add = (files: File[]) => {
    for (const file of files.filter((f) => f.type.startsWith("image/"))) upload.mutate({ file, target: { resourceId } });
  };
  const picker = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      multiple
      hidden
      onChange={(e) => {
        add([...(e.target.files ?? [])]);
        e.target.value = "";
      }}
    />
  );
  return { add, pick: () => input.current?.click(), picker, pending: upload.isPending };
}

function useSaveNote(r: Resource) {
  const update = useUpdate("resources");
  return {
    pending: update.isPending,
    save: (description: string) =>
      update.mutateAsync({ id: r.id, description }).then(
        () => true,
        () => false,
      ),
  };
}

/**
 * The note on a link card: your text and images. Clicking it opens the note in a bigger card.
 * `editing` is lifted so the card's menu can start a note too.
 */
export function LinkNote({
  r,
  images,
  editing,
  setEditing,
  open,
  setOpen,
}: {
  r: Resource;
  images: Attachment[];
  editing: boolean;
  setEditing: (v: boolean) => void;
  /** The bigger note card; the card's image opens it too. */
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const note = useSaveNote(r);
  const imgs = useAddImages(r.id);
  const has = !!r.description;

  return (
    <div className="mt-2.5">
      {imgs.picker}
      {editing ? (
        <InlineNoteEditor
          initial={r.description}
          allowEmpty
          maxLength={5000}
          pending={note.pending}
          placeholder={PLACEHOLDER}
          onPasteFiles={imgs.add}
          onCancel={() => setEditing(false)}
          onSave={async (d) => {
            if (await note.save(d)) setEditing(false);
          }}
        />
      ) : has ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Open note"
          className="flex w-full flex-col gap-2 rounded-lg border border-warning/25 bg-warning/8 px-2.5 py-2 text-left transition-colors hover:border-warning/50"
        >
          <span className="flex gap-2">
            <StickyNote className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span className="line-clamp-4 flex-1 text-xs leading-relaxed whitespace-pre-wrap">{r.description}</span>
          </span>
        </button>
      ) : null}

      {editing ? null : (
        <div className={cn("flex items-center gap-3", has && "mt-1.5")}>
          {r.description ? null : (
            <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Plus className="size-3.5" /> Add a note
            </button>
          )}
          <button type="button" onClick={imgs.pick} disabled={imgs.pending} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {imgs.pending ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />} Add image
          </button>
        </div>
      )}

      {open ? <LinkNoteDialog r={r} images={images} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

/**
 * Your note's images as the card's picture, like Google Keep: one image at its own shape,
 * two side by side, more as a large first image over a row of the rest.
 */
export function NoteImages({ images, onOpen }: { images: Attachment[]; onOpen: () => void }) {
  const [first, ...rest] = images;
  if (!first) return null;
  const row = rest.slice(0, 3);
  const more = rest.length - row.length;
  const img = (a: Attachment, className: string) => <img src={a.url} alt="" loading="lazy" className={cn("block w-full bg-muted object-cover", className)} />;
  return (
    <button type="button" onClick={onOpen} title="Open note" className="block w-full overflow-hidden border-b text-left">
      {images.length === 2 ? (
        <span className="grid grid-cols-2 gap-0.5">
          {img(first, "h-44")}
          {img(rest[0]!, "h-44")}
        </span>
      ) : (
        <>
          {img(first, "h-auto max-h-[28rem]")}
          {row.length ? (
            <span className="mt-0.5 grid grid-cols-3 gap-0.5">
              {row.map((a, i) => (
                <span key={a.id} className="relative">
                  {img(a, "h-20")}
                  {more > 0 && i === row.length - 1 ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold text-white">+{more}</span>
                  ) : null}
                </span>
              ))}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}

/** The note opened in a bigger card: the link, your full note, and every image at a readable size. */
function LinkNoteDialog({ r, images, onClose }: { r: Resource; images: Attachment[]; onClose: () => void }) {
  const note = useSaveNote(r);
  const imgs = useAddImages(r.id);
  const remove = useDeleteAttachment();
  const [editing, setEditing] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        onPaste={(e) => {
          if (editing) return; // the editor handles its own paste
          const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
          if (files.length) imgs.add(files);
        }}
      >
        {imgs.picker}
        <div className="flex items-start gap-3 pr-6">
          {r.previewImage ? <img src={r.previewImage} alt="" referrerPolicy="no-referrer" className="hidden h-16 w-28 shrink-0 rounded-md border object-cover sm:block" /> : null}
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base leading-snug">{r.title}</DialogTitle>
            {r.url ? (
              <DialogDescription asChild>
                <a href={r.url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-xs hover:text-primary">
                  {r.siteName ?? hostOf(r.url)} <ExternalLink className="size-3" />
                </a>
              </DialogDescription>
            ) : (
              <DialogDescription className="mt-1 text-xs">Note</DialogDescription>
            )}
          </div>
        </div>

        <section className="rounded-xl border border-warning/25 bg-warning/8 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <StickyNote className="size-4 text-warning" /> Your note
            </h3>
            {editing ? null : (
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(true)}>
                <Pencil /> {r.description ? "Edit" : "Write"}
              </Button>
            )}
          </div>
          {editing ? (
            <InlineNoteEditor
              initial={r.description}
              allowEmpty
              maxLength={5000}
              pending={note.pending}
              placeholder={PLACEHOLDER}
              onPasteFiles={imgs.add}
              onCancel={() => setEditing(false)}
              onSave={async (d) => {
                if (await note.save(d)) setEditing(false);
              }}
            />
          ) : r.description ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No note yet.</p>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Images {images.length ? <span className="font-normal text-muted-foreground">{images.length}</span> : null}
            </h3>
            <Button size="sm" variant="outline" className="h-7" onClick={imgs.pick} disabled={imgs.pending}>
              {imgs.pending ? <Loader2 className="animate-spin" /> : <ImagePlus />} Add image
            </Button>
          </div>
          {images.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {images.map((a) => (
                <figure key={a.id} className="group/img relative overflow-hidden rounded-lg border bg-muted">
                  <a href={a.url} target="_blank" rel="noreferrer" title="Open full size">
                    <img src={a.url} alt={a.fileName} loading="lazy" className="max-h-80 w-full object-contain" />
                  </a>
                  <button
                    type="button"
                    aria-label="Remove image"
                    title="Remove image"
                    onClick={async () => {
                      if (await confirm({ title: "Remove this image?", description: "It will be deleted from this note.", destructive: true })) remove.mutate(a.id);
                    }}
                    className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover/img:opacity-100 focus-visible:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </figure>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={imgs.pick}
              className="w-full rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              Add a screenshot or photo, or paste one here (Ctrl+V).
            </button>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
