import "./excalidraw-setup";
import "@excalidraw/excalidraw/index.css";
import { Excalidraw, getNonDeletedElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Attachment, Diagram, DiagramSummary } from "@shared/types";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { uploadFile, useAttachments, useList } from "@/lib/queries";
import { exportPdf, pdfFileName } from "./notebook";
import { inlineFilesOf, loadStoredFiles, storedFilesOf } from "./sceneFiles";

/**
 * Notebooks and drawings are retired (handwriting moved to GoodNotes). This saves each one,
 * with the same renderer the notebook's Done button used, as a PDF in its own folder, so
 * everything written there stays readable as a file. The drawings' data is kept as well.
 */

/** Same label the notebook used for its saved PDF, so a re-save replaces the old one. */
export const pdfLabel = (diagramId: string) => `diagram-pdf:${diagramId}`;

/** A drawing needs a PDF when it has none, or was edited after its last one. */
function needsPdf(d: DiagramSummary, pdfs: Attachment[]) {
  const latest = pdfs.filter((a) => a.label === pdfLabel(d.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return !latest || new Date(d.updatedAt).getTime() - new Date(latest.createdAt).getTime() > 10_000;
}

export default function SaveDrawingsAsPdf() {
  const qc = useQueryClient();
  const drawings = useList("diagrams");
  const files = useAttachments({});
  const [queue, setQueue] = useState<DiagramSummary[] | null>(null);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);

  const pending = useMemo(() => {
    const pdfs = (files.data ?? []).filter((a) => a.label.startsWith("diagram-pdf:"));
    return (drawings.data ?? []).filter((d) => needsPdf(d, pdfs));
  }, [drawings.data, files.data]);

  const running = !!queue && done + failed.length < queue.length;
  const current = running ? queue[done + failed.length] : undefined;
  const finished = !!queue && !running;

  useEffect(() => {
    if (finished) void qc.invalidateQueries({ queryKey: ["attachments"] });
  }, [finished, qc]);

  if (drawings.isLoading || files.isLoading) return <Loader2 className="size-4 animate-spin text-muted-foreground" />;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {finished
          ? `Saved ${done} PDF${done === 1 ? "" : "s"} into their folders${failed.length ? `; ${failed.length} couldn't be saved (${failed.join(", ")})` : ""}.`
          : running
            ? `Saving ${done + failed.length + 1} of ${queue!.length}: ${current?.title || "Untitled"}…`
            : pending.length
              ? `${pending.length} notebook${pending.length === 1 ? "" : "s"} or drawing${pending.length === 1 ? "" : "s"} not saved as a PDF yet.`
              : "Every notebook and drawing is saved as a PDF in its folder."}
      </p>
      {finished && !failed.length ? <CheckCircle2 className="size-4 text-success" /> : null}
      {pending.length && !running ? (
        <Button
          size="sm"
          onClick={() => {
            setDone(0);
            setFailed([]);
            setQueue(pending);
          }}
        >
          <FileText /> Save {pending.length} as PDF
        </Button>
      ) : null}
      {running ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      {current ? (
        <HiddenExport
          key={current.id}
          id={current.id}
          onDone={() => setDone((n) => n + 1)}
          onFail={() => setFailed((f) => [...f, current.title || "Untitled"])}
        />
      ) : null}
    </div>
  );
}

/** Opens one drawing off-screen, renders it to a PDF and saves that into the drawing's folder. */
function HiddenExport({ id, onDone, onFail }: { id: string; onDone: () => void; onFail: () => void }) {
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const started = useRef(false);

  useEffect(() => {
    api.get<Diagram>(`/diagrams/${id}`).then(setDiagram, onFail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const initialData = useMemo<ExcalidrawInitialDataState | null>(
    () =>
      diagram
        ? {
            elements: (diagram.scene.elements ?? []) as ExcalidrawInitialDataState["elements"],
            appState: { ...(diagram.scene.appState ?? {}), theme: "light" } as ExcalidrawInitialDataState["appState"],
            files: inlineFilesOf(diagram.scene.files as Record<string, unknown>),
          }
        : null,
    [diagram],
  );

  const run = async (draw: ExcalidrawImperativeAPI, d: Diagram) => {
    if (started.current) return;
    started.current = true;
    try {
      // Wait until the scene is in.
      for (let i = 0; i < 50 && (draw.getAppState().isLoading || draw.getAppState().width === 0); i++) await new Promise((r) => setTimeout(r, 100));
      if (!getNonDeletedElements(draw.getSceneElements()).some((e) => e.type !== "frame")) return onDone(); // empty: nothing to keep
      await loadStoredFiles(draw, [...storedFilesOf(d.scene.files as Record<string, unknown>).values()]);
      const { blob } = await exportPdf(draw);
      const label = pdfLabel(d.id);
      const previous = (await api.get<Attachment[]>("/attachments", { label })).filter((a) => a.label === label);
      await uploadFile(new File([blob], pdfFileName(d.title), { type: "application/pdf" }), { workspaceId: d.workspaceId, folderId: d.folderId, label });
      for (const a of previous) await api.delete(`/attachments/${a.id}`).catch(() => {});
      onDone();
    } catch {
      onFail();
    }
  };

  if (!diagram || !initialData) return null;
  return (
    // Off-screen but laid out, so Excalidraw renders normally.
    <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, width: 1200, height: 900, pointerEvents: "none" }}>
      <Excalidraw initialData={initialData} excalidrawAPI={(a) => setTimeout(() => void run(a, diagram), 300)} />
    </div>
  );
}
