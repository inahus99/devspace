import { Binary, ChevronRight, Download, FileText, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import type { SnippetInput } from "@shared/schemas";
import type { CodeSnippet } from "@shared/types";
import { confirm } from "@/components/common/ConfirmDialog";
import { Field, FolderSelect, TagInput } from "@/components/common/fields";
import { AutoTextarea } from "@/components/common/Markdown";
import { SaveIndicator } from "@/components/common/SaveIndicator";
import { ErrorState, FullPageSpinner } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { Button } from "@/components/ui/button";
import { ItemNotFound } from "@/features/misc/NotFoundPage";
import { useAutosave } from "@/hooks/useAutosave";
import { ApiError, downloadUrl, errorMessage } from "@/lib/api";
import { formatTimestamp } from "@/lib/dates";
import { useDelete, useItem, useUpdate, useWorkspaceMap } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export default function SnippetPage() {
  const { id } = useParams();
  const { data, isLoading, error, refetch } = useItem("snippets", id);
  if (isLoading) return <FullPageSpinner />;
  if (error instanceof ApiError && error.status === 404) return <ItemNotFound what="snippet" />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} className="m-8" />;
  if (!data) return null;
  return <SnippetEditor key={data.id} snippet={data} />;
}

function SnippetEditor({ snippet }: { snippet: CodeSnippet }) {
  const update = useUpdate("snippets", { silent: true });
  const del = useDelete("snippets");
  const navigate = useNavigate();
  const ws = useWorkspaceMap().get(snippet.workspaceId);
  const note = useItem("notes", snippet.noteId ?? undefined).data;
  const problem = useItem("dsa", snippet.dsaProblemId ?? undefined).data;

  const [title, setTitle] = useState(snippet.title);
  const [description, setDescription] = useState(snippet.description);
  const [language, setLanguage] = useState(snippet.language);
  const [code, setCode] = useState(snippet.code);
  const [tags, setTags] = useState(snippet.tags);
  const [folderId, setFolderId] = useState(snippet.folderId);
  const [favorite, setFavorite] = useState(snippet.isFavorite);

  const autosave = useAutosave<Partial<SnippetInput>>(async (patch) => {
    try {
      await update.mutateAsync({ id: snippet.id, ...patch });
    } catch (err) {
      toast.error(`Couldn't save: ${errorMessage(err)}`);
      throw err;
    }
  });

  const remove = async () => {
    if (!(await confirm({ title: `Delete “${title}”?`, destructive: true }))) return;
    del.mutate(snippet.id, { onSuccess: () => navigate(routes.workspace(snippet.workspaceId, { tab: "snippets" })) });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-5 text-xs text-muted-foreground">
        <nav className="flex items-center gap-1" aria-label="Breadcrumb">
          {ws ? (
            <Link to={routes.workspace(ws.id, { tab: "snippets" })} className="flex items-center gap-1.5 hover:text-foreground">
              <WorkspaceIcon icon={ws.icon} color={ws.color} size="sm" />
              {ws.name}
            </Link>
          ) : null}
          <ChevronRight className="size-3" />
          <span>Snippets</span>
        </nav>
        <div className="flex items-center gap-1">
          <SaveIndicator status={autosave.status} onRetry={() => void autosave.flush()} className="mr-2" />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => {
              setFavorite(!favorite);
              autosave.schedule({ isFavorite: !favorite });
            }}
            aria-label={favorite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={favorite}
          >
            <Star className={cn(favorite && "fill-warning text-warning")} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void autosave.flush().then(() => downloadUrl(`/export/snippets/${snippet.id}`))}>
            <Download /> Download
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => void remove()}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>

      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (e.target.value.trim()) autosave.schedule({ title: e.target.value.trim() });
        }}
        aria-label="Snippet title"
        placeholder="Snippet title"
        className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none"
      />
      <AutoTextarea
        value={description}
        onChange={(v) => {
          setDescription(v);
          autosave.schedule({ description: v });
        }}
        minRows={1}
        placeholder="Add a description…"
        className="mt-1 border-none px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      <CodeEditor
        className="mt-4"
        value={code}
        onChange={(v) => {
          setCode(v);
          autosave.schedule({ code: v });
        }}
        language={language}
        onLanguageChange={(v) => {
          setLanguage(v);
          autosave.schedule({ language: v as SnippetInput["language"] });
        }}
        height="auto"
        maxHeight={720}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Folder">
          <FolderSelect
            workspaceId={snippet.workspaceId}
            value={folderId}
            onChange={(v) => {
              setFolderId(v);
              autosave.schedule({ folderId: v });
            }}
          />
        </Field>
        <Field label="Tags">
          <TagInput
            value={tags}
            onChange={(t) => {
              setTags(t);
              autosave.schedule({ tags: t });
            }}
          />
        </Field>
      </div>

      {note || problem ? (
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          <span className="text-xs text-muted-foreground">Linked to</span>
          {note ? (
            <Link to={routes.note(note.id)} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-accent">
              <FileText className="size-3.5" /> {note.title}
            </Link>
          ) : null}
          {problem ? (
            <Link to={routes.dsa(problem.id)} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-accent">
              <Binary className="size-3.5" /> {problem.title}
            </Link>
          ) : null}
        </div>
      ) : null}

      <p className="mt-6 text-xs text-muted-foreground">
        Created {formatTimestamp(snippet.createdAt)} · Updated {formatTimestamp(snippet.updatedAt)}
      </p>
    </div>
  );
}
