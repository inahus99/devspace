import { Download, ExternalLink, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { toast } from "sonner";
import type { Attachment } from "@shared/types";
import { formatBytes } from "@/components/common/Attachments";
import { confirm } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/dates";
import { useDeleteAttachment, useUpload } from "@/lib/queries";
import { cn } from "@/lib/utils";

const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

/**
 * Handwritten notes from GoodNotes, kept as PDFs in this workspace or folder: export from
 * GoodNotes, then drop the file here. Old DevSpace notebooks saved as PDFs show up here too.
 */
export function GoodNotesPdfs({
  workspaceId,
  folderId,
  files,
  loading,
}: {
  workspaceId: string;
  folderId: string | null;
  /** This workspace's standalone files; the PDFs in this folder are picked out here. */
  files: Attachment[] | undefined;
  loading: boolean;
}) {
  const upload = useUpload();
  const remove = useDeleteAttachment();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(0);
  const pdfs = (files ?? []).filter((a) => a.kind === "pdf" && a.folderId === folderId);

  const add = async (list: File[]) => {
    const ok = list.filter(isPdf);
    if (list.length && !ok.length) return void toast.error("Only PDF files go here. In GoodNotes: Share › Export › PDF.");
    setBusy((n) => n + ok.length);
    for (const file of ok) {
      const type = file.type || "application/pdf";
      await upload
        .mutateAsync({ file: file.type ? file : new File([file], file.name, { type }), target: { workspaceId, folderId } })
        .catch(() => null)
        .finally(() => setBusy((n) => n - 1));
    }
    if (ok.length) toast.success(ok.length === 1 ? `Saved “${ok[0]!.name}”` : `Saved ${ok.length} PDFs`);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void add([...e.dataTransfer.files]);
  };

  return (
    <section
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          void add([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-tight">
          GoodNotes PDFs
          {pdfs.length ? <span className="ml-1.5 font-normal text-muted-foreground">{pdfs.length}</span> : null}
        </h2>
        <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={busy > 0}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />} Add PDF
        </Button>
      </div>

      <div className={cn("rounded-xl border bg-card shadow-soft transition-colors", over && "border-primary/60 bg-primary/5")}>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : pdfs.length ? (
          <ul className="divide-y">
            {pdfs.map((a) => (
              <li key={a.id} className="group flex items-center gap-3 px-3.5 py-2.5">
                <span className="flex h-11 w-9 shrink-0 items-center justify-center rounded-md border bg-red-500/8 text-red-600 dark:text-red-400">
                  <FileText className="size-4" />
                </span>
                <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1" title="Open PDF">
                  <span className="block truncate text-sm font-medium group-hover:text-primary">{a.fileName.replace(/\.pdf$/i, "")}</span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {formatBytes(a.sizeBytes)} · {a.label.startsWith("diagram-pdf:") ? "Old DevSpace notebook · " : ""}
                    {formatTimestamp(a.createdAt, "MMM d, yyyy")}
                  </span>
                </a>
                <Button asChild size="icon-xs" variant="ghost" aria-label="Open in a new tab" title="Open">
                  <a href={a.url} target="_blank" rel="noreferrer">
                    <ExternalLink />
                  </a>
                </Button>
                <Button asChild size="icon-xs" variant="ghost" aria-label="Download" title="Download">
                  <a href={`${a.url}?download=1`} download={a.fileName}>
                    <Download />
                  </a>
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Delete"
                  title="Delete"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    if (await confirm({ title: `Delete “${a.fileName}”?`, description: "The PDF will be removed from DevSpace.", destructive: true })) remove.mutate(a.id);
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="w-full px-4 py-7 text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Upload className="mx-auto mb-2 size-5 text-primary/50" />
            Drop a PDF here, or click to choose one.
            <span className="mt-1 block text-2xs">In GoodNotes: open the notebook › Share › Export › PDF.</span>
          </button>
        )}
        {pdfs.length ? (
          <p className="border-t px-3.5 py-2 text-2xs text-muted-foreground">Drop more PDFs here to add them.</p>
        ) : null}
      </div>
    </section>
  );
}
