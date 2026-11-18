import { lazy, Suspense, type ComponentType } from "react";
import type { CaptureDialogProps } from "@/components/common/capture";
import { useUi } from "@/stores/ui";

// Each dialog is code-split so the editors/forms behind them don't bloat the initial bundle.
const named = <K extends string>(load: () => Promise<Record<K, ComponentType<CaptureDialogProps>>>, key: K) =>
  lazy(() => load().then((m) => ({ default: m[key] })));

const dialogs = {
  workspace: named(() => import("@/features/workspaces/WorkspaceDialog"), "WorkspaceDialog"),
  note: named(() => import("@/features/notes/NoteCreateDialog"), "NoteCreateDialog"),
  snippet: named(() => import("@/features/snippets/SnippetDialog"), "SnippetDialog"),
  resource: named(() => import("@/features/resources/ResourceDialog"), "ResourceDialog"),
  dsa: named(() => import("@/features/dsa/DsaProblemDialog"), "DsaProblemDialog"),
  lld: named(() => import("@/features/lld/LldDialog"), "LldDialog"),
  activity: named(() => import("@/features/planner/ActivityDialog"), "ActivityDialog"),
  book: named(() => import("@/features/books/BookDialog"), "BookDialog"),
} as const;

/** Renders whichever create dialog was requested via useUi().openCapture(kind, defaults). */
export function QuickCaptureHost() {
  const capture = useUi((s) => s.capture);
  const close = useUi((s) => s.closeCapture);
  if (!capture) return null;
  const Dialog = dialogs[capture.kind as keyof typeof dialogs];
  if (!Dialog) return null;
  return (
    <Suspense fallback={null}>
      <Dialog open onOpenChange={(open: boolean) => !open && close()} defaults={capture.defaults} />
    </Suspense>
  );
}
