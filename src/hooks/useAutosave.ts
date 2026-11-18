import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Debounced, merge-on-write autosave.
 *   const autosave = useAutosave((patch) => update.mutateAsync({ id, ...patch }));
 *   autosave.schedule({ title });
 * - Patches are merged until the debounce fires; only one request is in flight.
 * - Unsaved changes are flushed on unmount and guarded on tab close.
 * - Failed saves keep the patch and retry on the next change or manual retry.
 */
export function useAutosave<T extends Record<string, unknown>>(save: (patch: T) => Promise<unknown>, delay = 800) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const pending = useRef<Partial<T> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) await inFlight.current;
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    setStatus("saving");
    let ok = false;
    const run = (async () => {
      try {
        await saveRef.current(patch as T);
        ok = true;
        if (!pending.current) setStatus("saved");
        setLastSavedAt(new Date());
      } catch {
        // Keep the failed changes so they are retried with the next edit.
        pending.current = { ...patch, ...(pending.current ?? {}) };
        setStatus("error");
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
    if (ok && pending.current && !timer.current) {
      // Changes arrived while saving.
      timer.current = setTimeout(() => void flush(), delay);
    }
  }, [delay]);

  const schedule = useCallback(
    (patch: Partial<T>) => {
      pending.current = { ...(pending.current ?? {}), ...patch };
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  // Guard against closing the tab with unsaved work.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [flush]);

  // Flush on unmount (navigating away).
  useEffect(() => () => void flush(), [flush]);

  return { schedule, flush, status, lastSavedAt, hasPending: () => !!pending.current };
}
