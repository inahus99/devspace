import "./excalidraw-setup";
import "@excalidraw/excalidraw/index.css";
import { Excalidraw, exportToBlob, getNonDeletedElements, MainMenu } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { ChevronDown, ChevronRight, Download, ExternalLink, FilePlus2, FileText, Loader2, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { DiagramInput } from "@shared/schemas";
import type { Attachment, Diagram } from "@shared/types";
import { confirm } from "@/components/common/ConfirmDialog";
import { SaveIndicator } from "@/components/common/SaveIndicator";
import { ErrorState, FullPageSpinner } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ItemNotFound } from "@/features/misc/NotFoundPage";
import { useAutosave } from "@/hooks/useAutosave";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useDelete, useDeleteAttachment, useFolders, useItem, useUpdate, useUpload, useWorkspaceMap } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { addPage, exportPdf, pdfFileName, saveBlob } from "./notebook";

export default function DiagramPage() {
  const { id } = useParams();
  const { data, isLoading, error, refetch } = useItem("diagrams", id);
  if (isLoading) return <FullPageSpinner />;
  if (error instanceof ApiError && error.status === 404) return <ItemNotFound what="diagram" />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} className="m-8" />;
  if (!data) return null;
  return <DiagramEditor key={data.id} diagram={data} />;
}

/** Tracks the app's resolved light/dark theme (the `dark` class on <html>). */
function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

type Elements = readonly { version: number }[];

function sceneSignature(elements: Elements, appState: Pick<AppState, "viewBackgroundColor">) {
  let v = 0;
  for (const el of elements) v = (v * 31 + el.version) | 0;
  return `${elements.length}:${v}:${appState.viewBackgroundColor}`;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Label tying a saved PDF to its drawing, so saving again replaces the previous export. */
const pdfLabel = (diagramId: string) => `diagram-pdf:${diagramId}`;

export function DiagramEditor({
  diagram,
  embedded,
  onReady,
}: {
  diagram: Diagram;
  /** Compact header for use beside the book reader. */
  embedded?: boolean;
  onReady?: (api: ExcalidrawImperativeAPI) => void;
}) {
  const update = useUpdate("diagrams", { silent: true });
  const del = useDelete("diagrams");
  const upload = useUpload();
  const delAttachment = useDeleteAttachment();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const ws = useWorkspaceMap().get(diagram.workspaceId);
  const folder = useFolders().data?.find((f) => f.id === diagram.folderId);
  const dark = useIsDark();

  const [title, setTitle] = useState(diagram.title);
  const [favorite, setFavorite] = useState(diagram.isFavorite);
  const [exporting, setExporting] = useState(false);
  const draw = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastSig = useRef<string | null>(null);
  const seeded = useRef(false);

  const backTo = diagram.bookId && !diagram.folderId ? routes.book(diagram.bookId) : routes.workspace(diagram.workspaceId, { folder: diagram.folderId ?? undefined });

  const initialData = useMemo<ExcalidrawInitialDataState>(
    () => ({
      elements: (diagram.scene.elements ?? []) as ExcalidrawInitialDataState["elements"],
      appState: { ...(diagram.scene.appState ?? {}), theme: dark ? "dark" : "light" } as ExcalidrawInitialDataState["appState"],
      files: (diagram.scene.files ?? {}) as BinaryFiles,
      scrollToContent: true,
    }),
    // Only used on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const autosave = useAutosave<Partial<DiagramInput> & { _scene?: true }>(async ({ _scene, ...patch }) => {
    try {
      if (_scene && draw.current) {
        const elements = getNonDeletedElements(draw.current.getSceneElements());
        const appState = draw.current.getAppState();
        const allFiles = draw.current.getFiles();
        const files: BinaryFiles = {};
        for (const el of elements) {
          if (el.type === "image" && el.fileId && allFiles[el.fileId]) files[el.fileId] = allFiles[el.fileId];
        }
        let preview = "";
        if (elements.length) {
          try {
            const blob = await exportToBlob({
              elements,
              files,
              appState: { ...appState, exportBackground: true, exportWithDarkMode: false },
              mimeType: "image/webp",
              quality: 0.8,
              maxWidthOrHeight: 640,
            });
            preview = await blobToDataUrl(blob);
          } catch {
            preview = diagram.preview;
          }
        }
        patch.scene = {
          elements: [...elements],
          appState: { viewBackgroundColor: appState.viewBackgroundColor, gridModeEnabled: appState.gridModeEnabled },
          files,
        };
        patch.preview = preview;
      }
      await update.mutateAsync({ id: diagram.id, ...patch });
    } catch (err) {
      toast.error(`Couldn't save: ${errorMessage(err)}`);
      throw err;
    }
  }, 1500);

  const remove = async () => {
    if (!(await confirm({ title: `Delete “${title}”?`, destructive: true }))) return;
    del.mutate(diagram.id, { onSuccess: () => navigate(backTo) });
  };

  const pdf = async (mode: "save" | "download") => {
    if (!draw.current) return;
    setExporting(true);
    try {
      const { blob, pages } = await exportPdf(draw.current);
      const name = pdfFileName(title);
      if (mode === "download") {
        saveBlob(blob, name);
        return;
      }
      const label = pdfLabel(diagram.id);
      const previous = (await api.get<Attachment[]>("/attachments", { workspaceId: diagram.workspaceId })).filter((a) => a.label === label);
      const saved = await upload.mutateAsync({
        file: new File([blob], name, { type: "application/pdf" }),
        target: { workspaceId: diagram.workspaceId, folderId: diagram.folderId, label },
      });
      for (const a of previous) await delAttachment.mutateAsync(a.id).catch(() => {});
      toast.success(`Saved “${name}” (${pages} page${pages === 1 ? "" : "s"}) to ${folder?.name ?? ws?.name ?? "the workspace"}`, {
        description: previous.length ? "Replaced the previous export." : undefined,
        action: { label: "Download", onClick: () => window.location.assign(`${saved.url}?download=1`) },
      });
    } catch (err) {
      toast.error(`Couldn't create the PDF: ${errorMessage(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const pdfMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" disabled={exporting}>
          {exporting ? <Loader2 className="animate-spin" /> : <FileText />} PDF <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={() => void pdf("save")}>
          <FileText /> Save PDF to {folder ? "folder" : "workspace"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void pdf("download")}>
          <Download /> Download PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-card/70 backdrop-blur", embedded ? "px-3 py-1.5" : "px-4 py-2 sm:px-6")}>
        {embedded ? null : (
          <nav className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
            {ws ? (
              <Link to={routes.workspace(ws.id)} className="flex shrink-0 items-center gap-1.5 hover:text-foreground">
                <WorkspaceIcon icon={ws.icon} color={ws.color} size="sm" />
                {ws.name}
              </Link>
            ) : null}
            {folder ? (
              <>
                <ChevronRight className="size-3 shrink-0" />
                <Link to={backTo} className="truncate hover:text-foreground">
                  {folder.name}
                </Link>
              </>
            ) : null}
            <ChevronRight className="size-3 shrink-0" />
          </nav>
        )}
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) autosave.schedule({ title: e.target.value.trim() });
          }}
          aria-label="Title"
          placeholder="Untitled"
          className="min-w-32 flex-1 bg-transparent text-sm font-semibold outline-none"
        />
        <div className="flex items-center gap-1">
          <SaveIndicator status={autosave.status} onRetry={() => void autosave.flush()} className="mr-1" />
          <Button variant="ghost" size="sm" className="h-8" onClick={() => draw.current && addPage(draw.current)} title="Add an A4 page below the last one">
            <FilePlus2 /> Page
          </Button>
          {pdfMenu}
          {embedded ? (
            <Button variant="ghost" size="icon" className="size-8" asChild>
              <Link to={routes.diagram(diagram.id)} aria-label="Open full screen" title="Open full screen">
                <ExternalLink />
              </Link>
            </Button>
          ) : (
            <>
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
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => void remove()} aria-label="Delete">
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={(a) => {
            draw.current = a;
            onReady?.(a);
            // A new notebook opens on its first blank page.
            if ((embedded || params.get("notebook") === "1") && !diagram.scene.elements.length && !seeded.current) {
              seeded.current = true;
              if (params.has("notebook")) setParams((p) => (p.delete("notebook"), p), { replace: true });
              setTimeout(() => addPage(a), 0);
            }
          }}
          initialData={initialData}
          theme={dark ? "dark" : "light"}
          name={title}
          onChange={(elements, appState) => {
            const sig = sceneSignature(elements, appState);
            if (lastSig.current === null) {
              lastSig.current = sig; // initial render
              return;
            }
            if (sig === lastSig.current) return;
            lastSig.current = sig;
            autosave.schedule({ _scene: true });
          }}
          UIOptions={{ canvasActions: { loadScene: true, saveToActiveFile: false, export: { saveFileToDisk: true } } }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
        </Excalidraw>
      </div>
    </div>
  );
}
