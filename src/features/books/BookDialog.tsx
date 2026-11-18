import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BOOK_STATUS_LABELS, BOOK_STATUSES, type BookStatus } from "@shared/constants";
import { isHttpUrl } from "@shared/schemas";
import { type CaptureDialogProps, str } from "@/components/common/capture";
import { EnumSelect, Field, WorkspaceSelect } from "@/components/common/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreate } from "@/lib/queries";
import { routes } from "@/lib/routes";

export function BookDialog({ open, onOpenChange, defaults }: CaptureDialogProps) {
  const navigate = useNavigate();
  const create = useCreate("books");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState("");
  const [status, setStatus] = useState<BookStatus>("want_to_read");
  const [coverUrl, setCoverUrl] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ title?: string; pages?: string; cover?: string }>({});

  useEffect(() => {
    if (!open) return;
    setTitle(str(defaults?.title) ?? "");
    setAuthor("");
    setPages("");
    setStatus("want_to_read");
    setCoverUrl("");
    setWorkspaceId(str(defaults?.workspaceId) ?? null);
    setErrors({});
  }, [open, defaults]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!title.trim()) next.title = "Title is required";
    const total = pages.trim() ? Number(pages) : 0;
    if (!Number.isInteger(total) || total < 0) next.pages = "Enter a whole number";
    if (coverUrl.trim() && !isHttpUrl(coverUrl.trim())) next.cover = "Enter a valid http(s) image URL";
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      const book = await create.mutateAsync({
        title: title.trim(),
        author: author.trim(),
        totalPages: total,
        status,
        coverUrl: coverUrl.trim(),
        workspaceId,
      });
      onOpenChange(false);
      navigate(routes.book(book.id));
    } catch {
      /* toast shown */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add a book</DialogTitle>
            <DialogDescription>You can add a cover, highlights and notes after saving.</DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor="book-title" error={errors.title}>
            <Input id="book-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} />
          </Field>
          <Field label="Author" htmlFor="book-author">
            <Input id="book-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total pages" htmlFor="book-pages" error={errors.pages}>
              <Input id="book-pages" type="number" min={0} inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value)} />
            </Field>
            <Field label="Status">
              <EnumSelect value={status} options={BOOK_STATUSES} labels={BOOK_STATUS_LABELS} onChange={(v) => v && setStatus(v)} />
            </Field>
          </div>
          <Field label="Cover image URL (optional)" htmlFor="book-cover" error={errors.cover}>
            <Input id="book-cover" placeholder="https://…" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
          </Field>
          <Field label="Workspace (optional)">
            <WorkspaceSelect value={workspaceId} onChange={setWorkspaceId} allowNone />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Add book
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
