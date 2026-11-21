import { Check, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { Memo, Resource } from "@shared/types";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/dates";
import { useCreate, useDelete, useUpdate } from "@/lib/queries";

/** How many favourite links a card shows before "+n". */
const SHOWN_FAVORITES = 4;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** The workspace's starred links, as chips that open the resource. */
export function FavoriteResources({ resources }: { resources: Resource[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!resources.length) return null;
  const shown = expanded ? resources : resources.slice(0, SHOWN_FAVORITES);
  const more = resources.length - shown.length;
  return (
    <div className="mt-3 border-t pt-3">
      <p className="mb-1.5 flex items-center gap-1 text-2xs font-medium text-muted-foreground">
        <Star className="size-3 fill-amber-400 text-amber-400" /> Favourite resources
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((r) => (
          <li key={r.id} className="min-w-0 max-w-full">
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              title={`${r.title} · ${hostOf(r.url)}`}
              className="block max-w-56 truncate rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs hover:border-primary/40 hover:text-primary"
            >
              {r.title}
            </a>
          </li>
        ))}
        {more > 0 || expanded ? (
          <li>
            <button type="button" onClick={() => setExpanded((v) => !v)} className="rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
              {expanded ? "Show fewer" : `+${more} more`}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** How many memos a card shows before "Show all". */
const SHOWN = 3;

/**
 * Short notes on a workspace card: how the topic is going, which resources are working.
 * Newest first. Ctrl+Enter saves, Esc cancels.
 */
export function WorkspaceMemos({ workspaceId, memos }: { workspaceId: string; memos: Memo[] }) {
  const create = useCreate("memos");
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? memos : memos.slice(0, SHOWN);

  return (
    <div className="mt-3 border-t pt-3">
      {shown.length ? (
        <ul className="space-y-2">
          {shown.map((m) => (
            <MemoItem key={m.id} memo={m} />
          ))}
        </ul>
      ) : null}
      {memos.length > SHOWN ? (
        <button type="button" className="mt-1.5 text-2xs text-muted-foreground hover:text-foreground" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer" : `Show all ${memos.length}`}
        </button>
      ) : null}
      {adding ? (
        <MemoEditor
          className={memos.length ? "mt-2" : ""}
          pending={create.isPending}
          onCancel={() => setAdding(false)}
          onSave={async (body) => {
            const ok = await create.mutateAsync({ workspaceId, body }).then(
              () => true,
              () => false,
            );
            if (ok) setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ${memos.length ? "mt-2" : ""}`}
        >
          <Plus className="size-3.5" /> {memos.length ? "Add a note" : "Add a note on how this is going"}
        </button>
      )}
    </div>
  );
}

function MemoItem({ memo }: { memo: Memo }) {
  const update = useUpdate("memos");
  const remove = useDelete("memos");
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li>
        <MemoEditor
          initial={memo.body}
          pending={update.isPending}
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            const ok = await update.mutateAsync({ id: memo.id, body }).then(
              () => true,
              () => false,
            );
            if (ok) setEditing(false);
          }}
        />
      </li>
    );
  }
  return (
    <li className="group/memo relative rounded-md bg-muted/50 px-2.5 py-1.5">
      <p className="line-clamp-4 whitespace-pre-wrap break-words pr-12 text-xs leading-relaxed">{memo.body}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(memo.updatedAt)}</p>
      <div className="absolute top-1 right-1 flex opacity-0 transition-opacity group-hover/memo:opacity-100 focus-within:opacity-100">
        <Button variant="ghost" size="icon" className="size-6" onClick={() => setEditing(true)} aria-label="Edit note">
          <Pencil className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 hover:text-destructive"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm("Delete this note?")) remove.mutate(memo.id);
          }}
          aria-label="Delete note"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </li>
  );
}

function MemoEditor({
  initial = "",
  pending,
  onSave,
  onCancel,
  className = "",
}: {
  initial?: string;
  pending: boolean;
  onSave: (body: string) => Promise<void>;
  onCancel: () => void;
  className?: string;
}) {
  const [body, setBody] = useState(initial);
  const save = () => {
    const text = body.trim();
    if (!text) return onCancel();
    if (text === initial.trim()) return onCancel();
    void onSave(text);
  };
  return (
    <div className={className}>
      <textarea
        autoFocus
        value={body}
        maxLength={2000}
        rows={3}
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="How you're approaching this, which resources are working for you…"
        className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <div className="mt-1 flex items-center justify-end gap-1">
        <span className="mr-auto text-[10px] text-muted-foreground">Ctrl+Enter to save · Esc to cancel</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onCancel}>
          <X /> Cancel
        </Button>
        <Button size="sm" className="h-6 px-2 text-xs" onClick={save} disabled={pending}>
          <Check /> Save
        </Button>
      </div>
    </div>
  );
}
