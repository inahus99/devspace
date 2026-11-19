import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { ErrorState, FullPageSpinner } from "@/components/common/states";
import { useItem } from "@/lib/queries";
import { DiagramEditor } from "./DiagramPage";
import { insertImage } from "./notebook";

export type NotebookHandle = {
  insertImage: (dataURL: string, natural: { width: number; height: number }) => void;
};

/** A notebook drawing embedded beside the book reader (lazy-loaded with Excalidraw). */
export default function NotebookPane({ diagramId, onReady }: { diagramId: string; onReady: (h: NotebookHandle | null) => void }) {
  const { data, isLoading, error, refetch } = useItem("diagrams", diagramId);
  if (isLoading) return <FullPageSpinner />;
  if (error || !data) return <ErrorState error={error ?? new Error("Notebook not found")} onRetry={() => void refetch()} className="m-4" />;
  return (
    <DiagramEditor
      key={data.id}
      diagram={data}
      embedded
      onReady={(api: ExcalidrawImperativeAPI) => onReady({ insertImage: (url, natural) => insertImage(api, url, natural) })}
    />
  );
}
