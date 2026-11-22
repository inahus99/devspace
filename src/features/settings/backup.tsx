import { useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { Archive, Download, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadUrl } from "@/lib/api";
import { timeAgo } from "@/lib/dates";
import { useMe } from "@/lib/queries";

/** Days after the last full backup before the dashboard reminds you. */
export const BACKUP_EVERY_DAYS = 7;
const SNOOZE_KEY = "devspace.backup.snoozedOn";

/** The last full backup, and a way to download a new one. */
export function useBackup() {
  const qc = useQueryClient();
  const last = useMe().data?.settings?.lastBackupAt ?? null;
  const daysSince = last ? differenceInCalendarDays(new Date(), new Date(last)) : null;
  const download = () => {
    downloadUrl("/export/archive.zip");
    // The server stamps lastBackupAt once the zip is fully written; pick it up when it lands.
    for (const ms of [4000, 15000, 60000]) setTimeout(() => void qc.invalidateQueries({ queryKey: ["me"] }), ms);
  };
  return { last, daysSince, overdue: daysSince === null || daysSince >= BACKUP_EVERY_DAYS, download };
}

export function lastBackupLabel(last: string | null) {
  return last ? `Last backup ${timeAgo(last)}` : "No backup downloaded yet";
}

/** Dashboard nudge, shown while a backup is overdue. "Later" hides it for the rest of the day. */
export function BackupNudge() {
  const { last, overdue, download } = useBackup();
  const today = new Date().toDateString();
  const [snoozed, setSnoozed] = useState(() => {
    try {
      return localStorage.getItem(SNOOZE_KEY) === today;
    } catch {
      return false;
    }
  });
  if (!overdue || snoozed) return null;
  const snooze = () => {
    setSnoozed(true);
    try {
      localStorage.setItem(SNOOZE_KEY, today);
    } catch {
      /* the nudge just comes back on reload */
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <Archive className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Time to save a copy of your notes</p>
        <p className="text-xs text-muted-foreground">
          {lastBackupLabel(last)}. The backup is one .zip laid out like your workspaces, with every note, drawing, file and book PDF.
        </p>
      </div>
      <Button size="sm" onClick={download}>
        <Download /> Download backup
      </Button>
      <Button variant="ghost" size="icon" className="size-8" onClick={snooze} aria-label="Remind me later">
        <X />
      </Button>
    </div>
  );
}
