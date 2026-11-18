/** Props shared by every quick-capture / create dialog (rendered by QuickCaptureHost). */
export interface CaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled values, e.g. { workspaceId, folderId, date, dsaProblemId }. */
  defaults?: Record<string, unknown>;
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
