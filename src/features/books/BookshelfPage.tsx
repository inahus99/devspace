import { BookOpen, Check, Library, Plus, Search } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router";
import { BOOK_STATUS_LABELS, type BookStatus } from "@shared/constants";
import type { Book } from "@shared/types";
import { addDaysISO } from "@shared/time";
import { EnumSelect } from "@/components/common/fields";
import { BookStatusPill } from "@/components/common/Pill";
import { EmptyState, ErrorState, LoadingRows, Page, PageHeader, Stat } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayISO } from "@/lib/dates";
import { useBookProgress, useList, useStats } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { BookCover, percent, ProgressBar } from "./BookCover";

type Filter = "all" | BookStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "reading", label: "Reading" },
  { id: "want_to_read", label: "Want to read" },
  { id: "completed", label: "Completed" },
  { id: "paused", label: "Paused" },
  { id: "abandoned", label: "Abandoned" },
];

type SortKey = "updated" | "title" | "author" | "progress";
const SORT_LABELS: Record<SortKey, string> = { updated: "Recently updated", title: "Title", author: "Author", progress: "Progress" };

export default function BookshelfPage() {
  const openCapture = useUi((s) => s.openCapture);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const { data, isLoading, error, refetch } = useList("books");

  const today = todayISO();
  const year = today.slice(0, 4);
  const stats = useStats({ from: addDaysISO(today, -29), to: today });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 };
    for (const b of data ?? []) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [data]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (data ?? []).filter(
      (b) => (filter === "all" || b.status === filter) && (!term || b.title.toLowerCase().includes(term) || b.author.toLowerCase().includes(term)),
    );
    const sorted = [...list];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "author") sorted.sort((a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title));
    else if (sort === "progress") sorted.sort((a, b) => percent(b.currentPage, b.totalPages) - percent(a.currentPage, a.totalPages));
    else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sorted;
  }, [data, filter, q, sort]);

  const completedThisYear = (data ?? []).filter((b) => b.status === "completed" && b.completedOn?.startsWith(year)).length;
  const reading = (data ?? []).filter((b) => b.status === "reading");

  return (
    <Page>
      <PageHeader
        title="Bookshelf"
        description="Track what you're reading, your progress and what stuck."
        actions={
          <Button size="sm" onClick={() => openCapture("book")}>
            <Plus /> Add book
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Currently reading" value={reading.length} icon={BookOpen} />
        <Stat label={`Completed in ${year}`} value={completedThisYear} icon={Check} />
        <Stat label="Pages read · 30 days" value={stats.data?.reading.pagesInRange ?? "–"} />
        <Stat label="On the shelf" value={data?.length ?? "–"} icon={Library} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                filter === f.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {f.label}
              <span className="ml-1 text-muted-foreground tabular">{counts[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or author" className="h-8 w-48 pl-8" aria-label="Search books" />
          </div>
          <EnumSelect size="sm" className="h-8 w-[160px]" value={sort} options={["updated", "title", "author", "progress"] as const} labels={SORT_LABELS} onChange={(v) => v && setSort(v)} />
        </div>
      </div>

      {isLoading ? (
        <LoadingRows rows={3} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !visible.length ? (
        <EmptyState
          icon={BookOpen}
          title={data?.length ? "No books match" : "Your shelf is empty"}
          description={data?.length ? "Try another filter or search." : "Add the technical books you're reading or want to read."}
          action={
            data?.length ? undefined : (
              <Button size="sm" onClick={() => openCapture("book")}>
                Add your first book
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((b) => (
            <BookCard key={b.id} book={b} />
          ))}
        </div>
      )}
    </Page>
  );
}

function BookCard({ book: b }: { book: Book }) {
  const pct = percent(b.currentPage, b.totalPages);
  return (
    <div className="group flex flex-col gap-2">
      <Link to={routes.book(b.id)} className="block rounded-md transition-transform group-hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring">
        <BookCover title={b.title} author={b.author} coverUrl={b.coverUrl} />
      </Link>
      <div className="min-w-0 space-y-1">
        <Link to={routes.book(b.id)} className="line-clamp-2 text-sm leading-snug font-medium hover:underline">
          {b.title}
        </Link>
        {b.author ? <p className="truncate text-xs text-muted-foreground">{b.author}</p> : null}
        {b.status === "reading" || (b.status === "paused" && b.totalPages > 0) ? (
          <div className="space-y-1 pt-0.5">
            <ProgressBar value={pct} />
            <div className="flex items-center justify-between text-2xs text-muted-foreground tabular">
              <span>
                {b.currentPage} / {b.totalPages || "?"}
              </span>
              <span>{pct}%</span>
            </div>
            {b.status === "reading" ? <QuickPage book={b} /> : null}
          </div>
        ) : (
          <BookStatusPill status={b.status} />
        )}
      </div>
    </div>
  );
}

function QuickPage({ book }: { book: Book }) {
  const progress = useBookProgress();
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const page = Number(value);
    if (!value.trim() || !Number.isInteger(page) || page < 0) return;
    progress.mutate({ id: book.id, currentPage: page, date: todayISO() }, { onSuccess: () => setValue("") });
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <Input
        type="number"
        min={0}
        max={book.totalPages || undefined}
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Page…"
        aria-label={`Update current page of ${book.title}`}
        className="h-7 px-2 text-xs"
      />
      <Button type="submit" size="xs" variant="secondary" disabled={!value || progress.isPending} title={`${BOOK_STATUS_LABELS.reading}: save page`}>
        Save
      </Button>
    </form>
  );
}
