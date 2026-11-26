import { ArrowLeft, BookOpen, BookOpenText, CalendarPlus, Download, FileUp, ImagePlus, Link2, Pencil, Quote, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { BOOK_STATUS_LABELS, BOOK_STATUSES } from "@shared/constants";
import { isHttpUrl } from "@shared/schemas";
import type { Book, BookHighlight } from "@shared/types";
import { confirm } from "@/components/common/ConfirmDialog";
import { EnumSelect, Field, TagInput, WorkspaceSelect } from "@/components/common/fields";
import { AutoTextarea, MarkdownField } from "@/components/common/Markdown";
import { SaveIndicator } from "@/components/common/SaveIndicator";
import { EmptyState, ErrorState, FullPageSpinner, Page, Section, Spinner } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAutosave } from "@/hooks/useAutosave";
import { errorMessage } from "@/lib/api";
import { formatDay, todayISO } from "@/lib/dates";
import {
  uploadFile,
  useAttachments,
  useBookProgress,
  useDeleteAttachment,
  useDelete,
  useDeleteReadingLog,
  useHighlightMutations,
  useHighlights,
  useItem,
  useReadingLogs,
  useUpdate,
} from "@/lib/queries";
import { routes } from "@/lib/routes";
import { useUi } from "@/stores/ui";
import { formatBytes } from "@/components/common/Attachments";
import { BookCover, percent, ProgressBar } from "./BookCover";
import { BOOK_FILE_LABEL } from "./bookFile";

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const { data: book, isLoading, error, refetch } = useItem("books", id);
  if (isLoading) return <FullPageSpinner />;
  if (error || !book)
    return (
      <Page>
        <ErrorState error={error ?? new Error("Book not found")} onRetry={() => void refetch()} />
      </Page>
    );
  return <BookDetail key={book.id} book={book} />;
}

type EditableText = { title: string; author: string; description: string; notes: string };

function BookDetail({ book }: { book: Book }) {
  const navigate = useNavigate();
  const update = useUpdate("books", { silent: true });
  const updateNow = useUpdate("books");
  const del = useDelete("books");
  const openCapture = useUi((s) => s.openCapture);
  const autosave = useAutosave<Partial<EditableText>>((patch) => update.mutateAsync({ id: book.id, ...patch }));
  const [text, setText] = useState<EditableText>({ title: book.title, author: book.author, description: book.description, notes: book.notes });

  const edit = <K extends keyof EditableText>(k: K, v: string) => {
    setText((t) => ({ ...t, [k]: v }));
    if (k === "title" && !v.trim()) return; // title is required; wait for a value
    autosave.schedule({ [k]: v } as Partial<EditableText>);
  };

  const remove = async () => {
    if (
      await confirm({
        title: `Delete “${book.title}”?`,
        description: "Its reading history, highlights and uploaded cover will be removed. This can't be undone.",
        destructive: true,
      })
    ) {
      del.mutate(book.id, { onSuccess: () => navigate(routes.books()) });
    }
  };

  const pct = percent(book.currentPage, book.totalPages);

  return (
    <Page>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to={routes.books()}>
            <ArrowLeft /> Bookshelf
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <SaveIndicator status={autosave.status} onRetry={() => void autosave.flush()} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => openCapture("activity", { bookId: book.id, workspaceId: book.workspaceId ?? undefined, title: `Read: ${book.title}` })}
          >
            <CalendarPlus /> Log reading
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => void remove()} aria-label="Delete book">
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-[200px_1fr]">
        <aside className="space-y-4">
          <CoverEditor book={book} />
          <div className="space-y-3 text-sm">
            <Field label="Status">
              <EnumSelect value={book.status} options={BOOK_STATUSES} labels={BOOK_STATUS_LABELS} onChange={(v) => v && updateNow.mutate({ id: book.id, status: v })} />
            </Field>
            <Field label="Total pages" htmlFor="book-total">
              <NumberInput
                id="book-total"
                value={book.totalPages}
                onCommit={(n) => updateNow.mutate({ id: book.id, totalPages: n })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Started" htmlFor="book-started">
                <Input
                  id="book-started"
                  type="date"
                  className="h-8 px-2 text-xs"
                  value={book.startedOn ?? ""}
                  onChange={(e) => updateNow.mutate({ id: book.id, startedOn: e.target.value || null })}
                />
              </Field>
              <Field label="Finished" htmlFor="book-finished">
                <Input
                  id="book-finished"
                  type="date"
                  className="h-8 px-2 text-xs"
                  value={book.completedOn ?? ""}
                  onChange={(e) => updateNow.mutate({ id: book.id, completedOn: e.target.value || null })}
                />
              </Field>
            </div>
            <Field label="Workspace">
              <WorkspaceSelect value={book.workspaceId} allowNone onChange={(v) => updateNow.mutate({ id: book.id, workspaceId: v })} />
            </Field>
            <Field label="Tags">
              <TagInput value={book.tags} onChange={(tags) => updateNow.mutate({ id: book.id, tags })} />
            </Field>
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <div className="space-y-1">
            <input
              value={text.title}
              onChange={(e) => edit("title", e.target.value)}
              className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground"
              placeholder="Title"
              aria-label="Title"
            />
            <input
              value={text.author}
              onChange={(e) => edit("author", e.target.value)}
              className="w-full bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
              placeholder="Author"
              aria-label="Author"
            />
          </div>

          <ProgressCard book={book} pct={pct} />

          <BookFileCard book={book} />

          <Field label="Description" htmlFor="book-desc">
            <AutoTextarea id="book-desc" value={text.description} onChange={(v) => edit("description", v)} minRows={2} placeholder="What's this book about?" />
          </Field>

          <HighlightsSection bookId={book.id} />

          <Section title="Notes" bodyClassName="p-3">
            <MarkdownField value={text.notes} onChange={(v) => edit("notes", v)} placeholder="Key ideas, takeaways, how you'll apply them…" minRows={6} uploadTarget={{ bookId: book.id }} />
          </Section>

          <ReadingHistory bookId={book.id} />
        </div>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------

function NumberInput({ id, value, onCommit }: { id?: string; value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 0) {
      setDraft(String(value));
      toast.error("Enter a whole number");
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <Input
      id={id}
      type="number"
      min={0}
      inputMode="numeric"
      className="h-8"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

function CoverEditor({ book }: { book: Book }) {
  const update = useUpdate("books");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState("");

  const onFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    setUploading(true);
    try {
      const a = await uploadFile(file, { bookId: book.id, label: "Cover" });
      await update.mutateAsync({ id: book.id, coverUrl: a.url });
      toast.success("Cover updated");
    } catch (err) {
      toast.error(`Upload failed: ${errorMessage(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const saveUrl = (e: FormEvent) => {
    e.preventDefault();
    const v = url.trim();
    if (!isHttpUrl(v)) {
      toast.error("Enter a valid http(s) image URL");
      return;
    }
    update.mutate({ id: book.id, coverUrl: v }, { onSuccess: () => setUrlMode(false) });
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <BookCover title={book.title} author={book.author} coverUrl={book.coverUrl} size="lg" />
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60">
            <Spinner />
          </div>
        ) : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
        }}
      />
      {urlMode ? (
        <form onSubmit={saveUrl} className="flex gap-1">
          <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-7 text-xs" aria-label="Cover image URL" />
          <Button size="icon-xs" variant="ghost" type="button" onClick={() => setUrlMode(false)} aria-label="Cancel">
            <X />
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-1">
          <Button size="xs" variant="ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <ImagePlus /> Upload cover
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setUrlMode(true)}>
            <Link2 /> URL
          </Button>
          {book.coverUrl ? (
            <Button size="xs" variant="ghost" onClick={() => update.mutate({ id: book.id, coverUrl: "" })}>
              Remove
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** The book's own PDF: upload once, then read it in DevSpace. */
function BookFileCard({ book }: { book: Book }) {
  const files = useAttachments({ bookId: book.id });
  const delFile = useDeleteAttachment();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const all = (files.data ?? []).filter((a) => a.label === BOOK_FILE_LABEL).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const file = all[0];

  const onFile = async (f: File) => {
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Choose a PDF file");
      return;
    }
    setUploading(true);
    try {
      await uploadFile(f, { bookId: book.id, workspaceId: book.workspaceId, label: BOOK_FILE_LABEL });
      for (const old of all) await delFile.mutateAsync(old.id).catch(() => {});
      await files.refetch();
      toast.success("PDF uploaded. Open Read to start.");
    } catch (err) {
      toast.error(`Upload failed: ${errorMessage(err)}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
        }}
      />
      {files.isLoading ? (
        <Spinner />
      ) : file ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <BookOpenText className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.fileName}</p>
            <p className="text-2xs text-muted-foreground">
              {formatBytes(file.sizeBytes)} · uploaded {formatDay(file.createdAt.slice(0, 10), "MMM d, yyyy")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" asChild>
              <Link to={routes.bookReader(book.id)}>
                <BookOpen /> Read
              </Link>
            </Button>
            <Button size="icon-sm" variant="ghost" asChild>
              <a href={`${file.url}?download=1`} aria-label="Download PDF" title="Download PDF">
                <Download />
              </a>
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => inputRef.current?.click()} disabled={uploading} aria-label="Replace PDF" title="Replace PDF">
              {uploading ? <Spinner /> : <FileUp />}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remove PDF"
              title="Remove PDF"
              onClick={() =>
                void confirm({ title: "Remove this book's PDF?", description: "Your progress and highlights stay.", destructive: true }).then(
                  (ok) => ok && delFile.mutate(file.id),
                )
              }
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
            {uploading ? <Spinner /> : <FileUp className="size-5" />}
          </span>
          <span>
            <span className="block text-sm font-medium">{uploading ? "Uploading…" : "Upload the book's PDF"}</span>
            <span className="block text-xs text-muted-foreground">Read it here, take handwritten notes beside it, and your page is saved as you go.</span>
          </span>
        </button>
      )}
    </div>
  );
}

function ProgressCard({ book, pct }: { book: Book; pct: number }) {
  const progress = useBookProgress();
  const [page, setPage] = useState(String(book.currentPage));
  const [date, setDate] = useState(todayISO());
  useEffect(() => setPage(String(book.currentPage)), [book.currentPage]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(page);
    if (!Number.isInteger(n) || n < 0) {
      toast.error("Enter a valid page number");
      return;
    }
    if (book.totalPages > 0 && n > book.totalPages) {
      toast.error(`This book has ${book.totalPages} pages`);
      return;
    }
    progress.mutate(
      { id: book.id, currentPage: n, date },
      { onSuccess: (b) => toast.success(b.status === "completed" ? "Finished — nice work!" : "Progress saved") },
    );
  };

  return (
    <div className="rounded-xl border bg-card shadow-soft p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Progress</div>
          <div className="text-2xl font-semibold tracking-tight tabular">
            {pct}%
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              page {book.currentPage}
              {book.totalPages ? ` of ${book.totalPages}` : ""}
            </span>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <Field label="Current page" htmlFor="progress-page">
            <Input
              id="progress-page"
              type="number"
              min={0}
              max={book.totalPages || undefined}
              inputMode="numeric"
              value={page}
              onChange={(e) => setPage(e.target.value)}
              className="h-8 w-24"
            />
          </Field>
          <Field label="Date" htmlFor="progress-date">
            <Input id="progress-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} className="h-8 w-36" />
          </Field>
          <Button type="submit" size="sm" disabled={progress.isPending}>
            Update progress
          </Button>
        </form>
      </div>
      <ProgressBar value={pct} className="mt-3" />
      {!book.totalPages ? <p className="mt-2 text-xs text-muted-foreground">Set the total pages to track a completion percentage.</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

function HighlightsSection({ bookId }: { bookId: string }) {
  const { data, isLoading } = useHighlights(bookId);
  const { create } = useHighlightMutations(bookId);
  const [adding, setAdding] = useState(false);

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Quote className="size-3.5 text-muted-foreground" /> Highlights
          {data?.length ? <span className="text-xs font-normal text-muted-foreground">{data.length}</span> : null}
        </span>
      }
      action={
        !adding ? (
          <Button size="xs" variant="ghost" onClick={() => setAdding(true)}>
            Add highlight
          </Button>
        ) : null
      }
      bodyClassName="p-3 space-y-3"
    >
      {adding ? (
        <HighlightForm
          onCancel={() => setAdding(false)}
          onSave={(v) => create.mutate(v, { onSuccess: () => setAdding(false) })}
          pending={create.isPending}
        />
      ) : null}
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        !adding ? <EmptyState compact icon={Quote} title="No highlights yet" description="Save passages worth remembering, with the page and your thoughts." /> : null
      ) : (
        <ul className="space-y-2">
          {data.map((h) => (
            <HighlightItem key={h.id} bookId={bookId} highlight={h} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function HighlightForm({
  initial,
  onSave,
  onCancel,
  pending,
}: {
  initial?: BookHighlight;
  onSave: (v: { content: string; page: number | null; note: string }) => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  const [content, setContent] = useState(initial?.content ?? "");
  const [page, setPage] = useState(initial?.page != null ? String(initial.page) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("Highlight text is required");
      return;
    }
    const p = page.trim() ? Number(page) : null;
    if (p !== null && (!Number.isInteger(p) || p < 0)) {
      toast.error("Page must be a whole number");
      return;
    }
    onSave({ content: content.trim(), page: p, note });
  };
  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border p-3">
      <AutoTextarea autoFocus value={content} onChange={setContent} placeholder="Quote or passage" minRows={2} aria-label="Highlight text" />
      <div className="flex gap-2">
        <Input type="number" min={0} value={page} onChange={(e) => setPage(e.target.value)} placeholder="Page" className="h-8 w-24" aria-label="Page" />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your note (optional)" className="h-8 flex-1" aria-label="Note" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}

function HighlightItem({ bookId, highlight: h }: { bookId: string; highlight: BookHighlight }) {
  const { update, remove } = useHighlightMutations(bookId);
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li>
        <HighlightForm
          initial={h}
          pending={update.isPending}
          onCancel={() => setEditing(false)}
          onSave={(v) => update.mutate({ id: h.id, ...v }, { onSuccess: () => setEditing(false) })}
        />
      </li>
    );
  }
  return (
    <li className="group relative rounded-md border-l-2 border-brand/50 bg-muted/30 py-2 pr-16 pl-3">
      <blockquote className="text-sm leading-6 whitespace-pre-wrap">{h.content}</blockquote>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {h.page != null ? <span>p. {h.page}</span> : null}
        {h.note ? <span className="text-foreground/80">{h.note}</span> : null}
      </div>
      <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button size="icon-xs" variant="ghost" onClick={() => setEditing(true)} aria-label="Edit highlight">
          <Pencil />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Delete highlight"
          onClick={async () => {
            if (await confirm({ title: "Delete this highlight?", destructive: true })) remove.mutate(h.id);
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Reading history
// ---------------------------------------------------------------------------

function ReadingHistory({ bookId }: { bookId: string }) {
  const { data, isLoading } = useReadingLogs(bookId);
  const del = useDeleteReadingLog(bookId);
  const totalPages = (data ?? []).reduce((s, l) => s + Math.max(0, l.toPage - l.fromPage), 0);
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <BookOpen className="size-3.5 text-muted-foreground" /> Reading history
          {data?.length ? (
            <span className="text-xs font-normal text-muted-foreground">
              {data.length} sessions · {totalPages} pages
            </span>
          ) : null}
        </span>
      }
      bodyClassName="p-0"
    >
      {isLoading ? (
        <div className="p-4">
          <Spinner />
        </div>
      ) : !data?.length ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Progress updates will appear here.</p>
      ) : (
        <ul className="divide-y">
          {data.map((l) => {
            const pages = l.toPage - l.fromPage;
            return (
              <li key={l.id} className="group flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-28 shrink-0 text-muted-foreground">{formatDay(l.loggedOn, "MMM d, yyyy")}</span>
                <span className="flex-1 tabular">
                  p. {l.fromPage} → {l.toPage}
                </span>
                <span className={pages >= 0 ? "text-success tabular" : "text-muted-foreground tabular"}>
                  {pages >= 0 ? `+${pages}` : pages} pages
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label="Delete entry"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Delete this reading entry?",
                        description: "Analytics will no longer count these pages. Your current page is unchanged.",
                        destructive: true,
                      })
                    )
                      del.mutate(l.id);
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
