import type { Editor } from "@tiptap/react";
import {
  CalendarPlus, ChevronRight, Code2, Columns2, Download, Eye, FileText, Hash, MoreHorizontal, Pencil, Star, Trash2,
} from "lucide-react";
import { marked } from "marked";
import { type ClipboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { NoteInput } from "@shared/schemas";
import type { Note } from "@shared/types";
import { AttachmentsPanel } from "@/components/common/Attachments";
import { confirm } from "@/components/common/ConfirmDialog";
import { flattenFolders, FolderSelect, TagInput } from "@/components/common/fields";
import { MarkdownView } from "@/components/common/Markdown";
import { SaveIndicator } from "@/components/common/SaveIndicator";
import { ErrorState, FullPageSpinner, Kbd, modKey } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { RichEditor, type RichContent } from "@/components/editor/RichEditor";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ItemNotFound } from "@/features/misc/NotFoundPage";
import { useAutosave } from "@/hooks/useAutosave";
import { ApiError, downloadUrl, errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/dates";
import { uploadFile, useDelete, useItem, useList, useUpdate, useWorkspaceFolders, useWorkspaceMap } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { goTo, isNotesApp } from "@/lib/app";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
turndown.use(gfm);

export default function NotePage() {
  const { id } = useParams();
  const { data: note, isLoading, error, refetch } = useItem("notes", id);
  if (isLoading) return <FullPageSpinner />;
  if (error instanceof ApiError && error.status === 404) return <ItemNotFound what="note" />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} className="m-8" />;
  if (!note) return null;
  // Keyed: local editing state initialises once per note and is never clobbered by refetches.
  return <NoteEditor key={note.id} note={note} />;
}

function NoteEditor({ note }: { note: Note }) {
  const update = useUpdate("notes", { silent: true });
  const del = useDelete("notes");
  const navigate = useNavigate();
  const openCapture = useUi((s) => s.openCapture);
  const workspaces = useWorkspaceMap();
  const workspace = workspaces.get(note.workspaceId);
  const folders = useWorkspaceFolders(note.workspaceId);

  const [title, setTitle] = useState(note.title === "Untitled" ? "" : note.title);
  const [format, setFormat] = useState(note.format);
  const [markdown, setMarkdown] = useState(note.contentMarkdown);
  const [richInitial, setRichInitial] = useState<unknown>(note.contentJson ?? note.contentHtml ?? "");
  const [richVersion, setRichVersion] = useState(0);
  const [tags, setTags] = useState(note.tags);
  const [favorite, setFavorite] = useState(note.isFavorite);
  const [folderId, setFolderId] = useState(note.folderId);
  const [mdView, setMdView] = useState<"split" | "write" | "preview">("split");
  const editorRef = useRef<Editor | null>(null);
  const latestRich = useRef<RichContent | null>(null);

  const autosave = useAutosave<Partial<NoteInput>>(async (patch) => {
    try {
      await update.mutateAsync({ id: note.id, ...patch });
    } catch (err) {
      toast.error(`Couldn't save: ${errorMessage(err)}`);
      throw err;
    }
  });

  // Ctrl/Cmd+S saves immediately.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void autosave.flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autosave]);

  const upload = useCallback(
    (file: File) => uploadFile(file, { noteId: note.id }).then((a) => ({ url: a.url, fileName: a.fileName, kind: a.kind })),
    [note.id],
  );

  const onRichChange = useCallback(
    (c: RichContent) => {
      latestRich.current = c;
      autosave.schedule({ contentJson: c.json, contentHtml: c.html, plainText: c.text });
    },
    [autosave],
  );

  const switchFormat = async (next: "rich" | "markdown") => {
    if (next === format) return;
    if (
      !(await confirm({
        title: next === "markdown" ? "Convert to Markdown?" : "Convert to rich text?",
        description:
          next === "markdown"
            ? "The note is converted to Markdown source. Images and formatting are preserved as Markdown; table column widths are not."
            : "The Markdown source is rendered into rich text you can keep editing visually.",
        confirmLabel: "Convert",
      }))
    )
      return;
    if (next === "markdown") {
      const html = latestRich.current?.html ?? editorRef.current?.getHTML() ?? note.contentHtml;
      const md = turndown.turndown(html || "");
      setMarkdown(md);
      setFormat("markdown");
      autosave.schedule({ format: "markdown", contentMarkdown: md, plainText: md });
    } else {
      const html = marked.parse(markdown, { async: false, gfm: true }) as string;
      setRichInitial(html);
      setRichVersion((v) => v + 1);
      setFormat("rich");
      autosave.schedule({ format: "rich", contentHtml: html, contentJson: null, plainText: markdown });
    }
  };

  const onMarkdownPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    let insert = "";
    for (const f of files) {
      try {
        const a = await toast.promise(uploadFile(f, { noteId: note.id }), { loading: "Uploading image…", success: "Image uploaded", error: (err) => errorMessage(err) }).unwrap();
        insert += `![${a.fileName}](${a.url})\n`;
      } catch {
        /* toast shown */
      }
    }
    if (!insert) return;
    const next = markdown.slice(0, start) + insert + markdown.slice(el.selectionEnd);
    setMarkdown(next);
    autosave.schedule({ contentMarkdown: next, plainText: next });
  };

  const folderPath = useMemo(() => {
    if (!folderId) return [];
    const flat = flattenFolders(folders);
    const byId = new Map(flat.map((f) => [f.folder.id, f.folder]));
    const out = [];
    let cur = byId.get(folderId);
    while (cur) {
      out.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return out;
  }, [folders, folderId]);

  const remove = async () => {
    if (!(await confirm({ title: "Delete this note?", description: "The note and its attached images and files are permanently deleted.", destructive: true }))) return;
    const back = isNotesApp
      ? note.folderId
        ? routes.notebooks(note.folderId, { tab: "notes" })
        : routes.notesWorkspace(note.workspaceId)
      : routes.workspace(note.workspaceId, { tab: "notes", folder: note.folderId });
    del.mutate(note.id, { onSuccess: () => goTo(navigate, back) });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-4 pb-24 sm:px-10">
      {/* Breadcrumb + status */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-6 text-xs text-muted-foreground">
        <nav className="flex min-w-0 items-center gap-1" aria-label="Breadcrumb">
          {workspace ? (
            <Link to={isNotesApp ? routes.notesWorkspace(workspace.id) : routes.workspace(workspace.id, { tab: "notes" })} className="flex items-center gap-1.5 hover:text-foreground">
              <WorkspaceIcon icon={workspace.icon} color={workspace.color} size="sm" />
              {workspace.name}
            </Link>
          ) : null}
          {folderPath.map((f) => (
            <span key={f.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3 shrink-0" />
              <Link
                to={isNotesApp ? routes.notebooks(f.id, { tab: "notes" }) : routes.workspace(note.workspaceId, { tab: "notes", folder: f.id })}
                className="truncate hover:text-foreground"
              >
                {f.name}
              </Link>
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <SaveIndicator status={autosave.status} onRetry={() => void autosave.flush()} />
          <span className="hidden sm:inline">Edited {timeAgo(note.updatedAt)}</span>
          <button
            type="button"
            onClick={() => {
              setFavorite(!favorite);
              autosave.schedule({ isFavorite: !favorite });
            }}
            className="rounded p-1 hover:bg-accent"
            aria-label={favorite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={favorite}
          >
            <Star className={cn("size-4", favorite && "fill-warning text-warning")} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded p-1 hover:bg-accent" aria-label="Note actions">
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => void switchFormat(format === "rich" ? "markdown" : "rich")}>
                {format === "rich" ? <Hash /> : <FileText />}
                Convert to {format === "rich" ? "Markdown" : "rich text"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void autosave.flush().then(() => downloadUrl(`/export/notes/${note.id}`))}
              >
                <Download /> Export as Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCapture("snippet", { workspaceId: note.workspaceId, folderId: note.folderId, noteId: note.id })}>
                <Code2 /> New linked snippet
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openCapture("activity", { workspaceId: note.workspaceId, noteId: note.id, title: `Study: ${title || "Untitled"}` })}
              >
                <CalendarPlus /> Log study activity
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
                <Trash2 /> Delete note
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Title */}
      <textarea
        value={title}
        onChange={(e) => {
          const v = e.target.value.replace(/\n/g, "");
          setTitle(v);
          autosave.schedule({ title: v.trim() || "Untitled" });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            editorRef.current?.commands.focus("start");
          }
        }}
        placeholder="Untitled"
        rows={1}
        aria-label="Note title"
        className="field-sizing-content w-full resize-none bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
      />

      {/* Properties */}
      <div className="mt-3 mb-4 grid gap-2 text-sm sm:grid-cols-[100px_1fr] sm:items-center">
        <span className="text-xs text-muted-foreground">Folder</span>
        <FolderSelect
          workspaceId={note.workspaceId}
          value={folderId}
          onChange={(v) => {
            setFolderId(v);
            autosave.schedule({ folderId: v });
          }}
          className="h-8 max-w-xs"
        />
        <span className="text-xs text-muted-foreground">Tags</span>
        <TagInput
          value={tags}
          onChange={(t) => {
            setTags(t);
            autosave.schedule({ tags: t });
          }}
          className="max-w-md"
        />
      </div>

      {/* Body */}
      {format === "rich" ? (
        <RichEditor
          key={richVersion}
          initialContent={richInitial}
          onChange={onRichChange}
          onUpload={upload}
          editorRef={(e) => {
            editorRef.current = e;
          }}
        />
      ) : (
        <div>
          <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between border-b bg-background/95 px-1 py-1 backdrop-blur">
            <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
              <Hash className="size-3.5" /> Markdown · paste images to upload
            </span>
            <div className="flex rounded-md border p-0.5 text-xs">
              {(
                [
                  ["write", Pencil, "Write"],
                  ["split", Columns2, "Split"],
                  ["preview", Eye, "Preview"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMdView(v)}
                  className={cn("flex items-center gap-1 rounded px-2 py-0.5", mdView === v ? "bg-accent text-foreground" : "text-muted-foreground")}
                  aria-pressed={mdView === v}
                >
                  <Icon className="size-3" /> {label}
                </button>
              ))}
            </div>
          </div>
          <div className={cn("grid gap-6 pt-4", mdView === "split" && "lg:grid-cols-2")}>
            {mdView !== "preview" ? (
              <textarea
                value={markdown}
                onChange={(e) => {
                  setMarkdown(e.target.value);
                  autosave.schedule({ contentMarkdown: e.target.value, plainText: e.target.value });
                }}
                onPaste={(e) => void onMarkdownPaste(e)}
                placeholder="# Start writing Markdown…"
                aria-label="Markdown source"
                className="min-h-[60vh] w-full resize-none bg-transparent font-mono text-[13px] leading-6 outline-none"
              />
            ) : null}
            {mdView !== "write" ? (
              <div className={cn(mdView === "split" && "border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6")}>
                <MarkdownView source={markdown} className="text-[15px] leading-7" empty="Preview appears here." />
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="mt-12 space-y-4">
        <AttachmentsPanel target={{ noteId: note.id }} title="Images & files in this note" emptyHint="Drop or paste files here — they're stored with this note." />
        <LinkedSnippets noteId={note.id} />
      </div>
      <p className="mt-6 text-center text-2xs text-muted-foreground">
        Autosaves as you type · <Kbd>{modKey} S</Kbd> to save now
      </p>
    </div>
  );
}

function LinkedSnippets({ noteId }: { noteId: string }) {
  const { data } = useList("snippets", { noteId });
  if (!data?.length) return null;
  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <header className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-medium">
        <Code2 className="size-3.5 text-muted-foreground" /> Linked snippets
      </header>
      <ul className="divide-y">
        {data.map((s) => (
          <li key={s.id}>
            <Link to={routes.snippet(s.id)} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-accent/50">
              {s.title}
              <span className="text-xs text-muted-foreground">{s.language}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
