import { ArrowLeft, BookOpen, ClipboardCopy, Download, ImagePlus, Loader2, Minus, MoveHorizontal, NotebookPen, PanelRightClose, Plus, Upload } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { Book } from "@shared/types";
import { WorkspaceSelect } from "@/components/common/fields";
import { PageSlot, usePdfDocument } from "@/components/pdf/PdfPages";
import { EmptyState, ErrorState, FullPageSpinner } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import type { NotebookHandle } from "@/features/diagrams/NotebookPane";
import { errorMessage } from "@/lib/api";
import { isNotesApp } from "@/lib/app";
import { todayISO } from "@/lib/dates";
import { useAttachments, useBookProgress, useCreate, useItem, useList, useUpdate } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { BOOK_FILE_LABEL, isPdfFile, uploadBookPdf } from "./bookFile";

const NotebookPane = lazy(() => import("@/features/diagrams/NotebookPane"));


export default function BookReaderPage() {
  const { id } = useParams<{ id: string }>();
  const book = useItem("books", id);
  const files = useAttachments({ bookId: id! }, { enabled: !!id });
  if (book.isLoading || files.isLoading) return <FullPageSpinner />;
  if (book.error || !book.data) return <ErrorState error={book.error ?? new Error("Book not found")} onRetry={() => void book.refetch()} className="m-8" />;
  const file = (files.data ?? [])
    .filter((a) => a.label === BOOK_FILE_LABEL && a.kind === "pdf")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!file) return <NoPdf book={book.data} onUploaded={() => void files.refetch()} />;
  return <Reader key={file.id} book={book.data} url={file.url} fileName={file.fileName} />;
}

function NoPdf({ book, onUploaded }: { book: Book; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (f: File) => {
    if (!isPdfFile(f)) return void toast.error("Choose a PDF file");
    setBusy(true);
    try {
      await uploadBookPdf(book, f);
      onUploaded();
    } catch (err) {
      toast.error(`Upload failed: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <EmptyState
      icon={BookOpen}
      className="m-8"
      title={`No PDF for “${book.title}” yet`}
      description="Upload the book's PDF to read it here, with a notebook beside it."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onFile(f);
            }}
          />
          <Button onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload PDF
          </Button>
          <Button variant="outline" asChild>
            <Link to={isNotesApp ? routes.notebooks() : routes.book(book.id)}>{isNotesApp ? "Back" : "Go to the book"}</Link>
          </Button>
        </div>
      }
    />
  );
}

type Zoom = "fit" | number;

function Reader({ book, url, fileName }: { book: Book; url: string; fileName: string }) {
  const [params, setParams] = useSearchParams();
  const notesOpen = params.get("notes") === "1";
  const setNotesOpen = (open: boolean) =>
    setParams((p) => {
      if (open) p.set("notes", "1");
      else p.delete("notes");
      return p;
    });

  const { doc, base, error: loadError } = usePdfDocument(url);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const notebook = useRef<NotebookHandle | null>(null);
  const setNotebook = useCallback((h: NotebookHandle | null) => {
    notebook.current = h;
  }, []);

  // Fit-width tracks the reader pane's width.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  const scale = zoom === "fit" ? Math.max(0.25, Math.min(4, (width - 32) / base.width)) : zoom;
  const numPages = doc?.numPages ?? 0;

  const goTo = useCallback((n: number, smooth = false) => {
    const el = slots.current[n - 1];
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 12, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Open where you left off, and keep the current page in view when zooming.
  const resumed = useRef(false);
  useEffect(() => {
    if (!doc || !width) return;
    if (!resumed.current) {
      resumed.current = true;
      const start = Math.min(Math.max(book.currentPage, 1), doc.numPages);
      setPage(start);
      setPageInput(String(start));
      requestAnimationFrame(() => goTo(start));
      setTimeout(() => goTo(start), 50);
      return;
    }
    goTo(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, scale]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el || !numPages) return;
    const mark = el.scrollTop + el.clientHeight * 0.35;
    let lo = 0;
    let hi = numPages - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((slots.current[mid]?.offsetTop ?? 0) <= mark) lo = mid;
      else hi = mid - 1;
    }
    if (lo + 1 !== page) {
      setPage(lo + 1);
      setPageInput(String(lo + 1));
    }
  };

  // Save reading progress as you go (forward only), and once more when leaving.
  const progress = useBookProgress();
  const updateBook = useUpdate("books", { silent: true });
  const saved = useRef(book.currentPage);
  const pending = useRef<number | null>(null);
  const flush = useCallback(() => {
    const n = pending.current;
    pending.current = null;
    if (n === null || n <= saved.current) return;
    saved.current = n;
    progress.mutate({ id: book.id, currentPage: n, date: todayISO() });
  }, [book.id, progress]);
  useEffect(() => {
    if (!doc || !resumed.current || page <= saved.current) return;
    pending.current = page;
    const t = setTimeout(flush, 4000);
    return () => clearTimeout(t);
  }, [page, doc, flush]);
  useEffect(() => () => flush(), [flush]);
  useEffect(() => {
    if (doc && !book.totalPages) updateBook.mutate({ id: book.id, totalPages: doc.numPages });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  /** Renders the current page to an image for the notebook or clipboard. */
  const snapshot = async () => {
    const p = await doc!.getPage(page);
    const vp1 = p.getViewport({ scale: 1 });
    const vp = p.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await p.render({ canvas, viewport: vp, background: "#ffffff" }).promise;
    return { canvas, natural: { width: vp1.width, height: vp1.height } };
  };

  const sendToNotebook = async () => {
    if (!doc) return;
    if (!notebook.current) {
      setNotesOpen(true);
      toast.info("Notebook opened. Click again to add this page.");
      return;
    }
    setBusy(true);
    try {
      const { canvas, natural } = await snapshot();
      notebook.current.insertImage(canvas.toDataURL("image/jpeg", 0.85), natural);
      toast.success(`Page ${page} added to your notebook`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copyPage = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const { canvas } = await snapshot();
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't render the page"))), "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success(`Page ${page} copied. Paste it into any note or drawing.`);
    } catch (err) {
      toast.error(`Couldn't copy: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const zoomBy = (dir: 1 | -1) => setZoom(() => Math.round(Math.max(0.25, Math.min(4, scale + dir * 0.15)) * 100) / 100);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b bg-card/80 px-3 py-2 backdrop-blur sm:px-4">
        <Button variant="ghost" size="sm" className="h-8" asChild>
          <Link to={isNotesApp ? routes.notebooks() : routes.book(book.id)}>
            <ArrowLeft /> <span className="hidden sm:inline">{isNotesApp ? "Notes" : "Book"}</span>
          </Link>
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={book.title}>
          {book.title}
        </p>

        <form
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Math.min(Math.max(Number(pageInput) || 1, 1), numPages || 1);
            setPageInput(String(n));
            goTo(n);
          }}
        >
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setPageInput(String(page))}
            inputMode="numeric"
            aria-label="Page number"
            className="h-8 w-12 rounded-md border bg-background text-center text-sm text-foreground tabular outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="tabular">/ {numPages || "…"}</span>
        </form>

        <div className="flex items-center rounded-lg border bg-card shadow-xs">
          <Button variant="ghost" size="icon" className="size-8 rounded-r-none" onClick={() => zoomBy(-1)} aria-label="Zoom out">
            <Minus />
          </Button>
          <span className="w-12 text-center text-xs tabular">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" className="size-8 rounded-none" onClick={() => zoomBy(1)} aria-label="Zoom in">
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8 rounded-l-none border-l", zoom === "fit" && "text-primary")}
            onClick={() => setZoom("fit")}
            aria-label="Fit width"
            title="Fit width"
          >
            <MoveHorizontal />
          </Button>
        </div>

        <Button variant="ghost" size="sm" className="h-8" onClick={() => void copyPage()} disabled={!doc || busy} title="Copy this page as an image">
          <ClipboardCopy /> <span className="hidden md:inline">Copy page</span>
        </Button>
        <Button variant="ghost" size="sm" className="h-8" onClick={() => void sendToNotebook()} disabled={!doc || busy} title="Add this page to your notebook to annotate it">
          {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} <span className="hidden md:inline">To notebook</span>
        </Button>
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <a href={`${url}?download=1`} aria-label={`Download ${fileName}`} title="Download PDF">
            <Download />
          </a>
        </Button>
        <Button variant={notesOpen ? "secondary" : "default"} size="sm" className="h-8" onClick={() => setNotesOpen(!notesOpen)}>
          {notesOpen ? <PanelRightClose /> : <NotebookPen />} {notesOpen ? "Hide notes" : "Notes"}
        </Button>
      </div>

      <div className={cn("flex min-h-0 flex-1", notesOpen ? "flex-col lg:flex-row" : "")}>
        <div ref={scroller} onScroll={onScroll} className={cn("relative min-h-0 overflow-auto bg-muted/60", notesOpen ? "h-1/2 lg:h-auto lg:w-1/2" : "flex-1")}>
          {loadError ? (
            <ErrorState error={loadError} className="m-8" />
          ) : !doc ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Opening the PDF…
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-4 py-4">
              {Array.from({ length: numPages }, (_, i) => (
                <PageSlot
                  key={i}
                  doc={doc}
                  n={i + 1}
                  scale={scale}
                  base={base}
                  root={scroller}
                  slotRef={(el) => {
                    slots.current[i] = el;
                  }}
                />
              ))}
            </div>
          )}
        </div>
        {notesOpen ? (
          <div className="flex min-h-0 flex-1 flex-col border-t bg-background lg:border-t-0 lg:border-l">
            <BookNotebook book={book} onReady={setNotebook} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The book's notebook beside the reader; created on first use. */
function BookNotebook({ book, onReady }: { book: Book; onReady: (h: NotebookHandle | null) => void }) {
  const list = useList("diagrams", { bookId: book.id });
  const create = useCreate("diagrams");
  const [workspaceId, setWorkspaceId] = useState<string | null>(book.workspaceId);
  const notebook = useMemo(() => [...(list.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0], [list.data]);
  useEffect(() => () => onReady(null), [onReady]);

  if (list.isLoading) return <FullPageSpinner />;
  if (notebook)
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <NotebookPane diagramId={notebook.id} onReady={onReady} />
      </Suspense>
    );
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-5 text-center shadow-soft">
        <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
          <NotebookPen className="size-5" />
        </span>
        <h2 className="mt-3 text-sm font-semibold">Start a notebook for this book</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Handwrite with a pen or type on A4 pages, drop in screenshots or whole book pages, then save it all as a PDF.
        </p>
        {book.workspaceId ? null : (
          <div className="mt-4 text-left">
            <p className="mb-1.5 text-xs font-medium">Keep it in workspace</p>
            <WorkspaceSelect value={workspaceId} onChange={setWorkspaceId} />
          </div>
        )}
        <Button
          className="mt-4 w-full"
          disabled={!workspaceId || create.isPending}
          onClick={() => create.mutate({ workspaceId: workspaceId!, bookId: book.id, title: `${book.title} notes` })}
        >
          <Plus /> Create notebook
        </Button>
      </div>
    </div>
  );
}
