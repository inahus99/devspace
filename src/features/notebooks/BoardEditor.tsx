import { ErrorState, FullPageSpinner } from "@/components/common/states";
import { DiagramEditor } from "@/features/diagrams/DiagramPage";
import { useItem } from "@/lib/queries";

/** A folder's board in edit mode (lazy-loaded with Excalidraw). */
export default function BoardEditor({ boardId, onDone }: { boardId: string; onDone: () => void }) {
  const { data, isLoading, error, refetch } = useItem("diagrams", boardId);
  if (isLoading) return <FullPageSpinner />;
  if (error || !data) return <ErrorState error={error ?? new Error("Notebook not found")} onRetry={() => void refetch()} className="m-8" />;
  return <DiagramEditor key={data.id} diagram={data} variant="board" onDone={onDone} />;
}
