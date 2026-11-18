import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { SaveStatus } from "@/hooks/useAutosave";
import { cn } from "@/lib/utils";

export function SaveIndicator({ status, onRetry, className }: { status: SaveStatus; onRetry?: () => void; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)} aria-live="polite">
      {status === "pending" ? (
        <>
          <span className="size-1.5 rounded-full bg-warning" /> Unsaved
        </>
      ) : status === "saving" ? (
        <>
          <Loader2 className="size-3 animate-spin" /> Saving…
        </>
      ) : status === "saved" ? (
        <>
          <Check className="size-3 text-success" /> Saved
        </>
      ) : status === "error" ? (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-destructive hover:underline">
          <AlertCircle className="size-3" /> Not saved — retry
        </button>
      ) : null}
    </span>
  );
}
