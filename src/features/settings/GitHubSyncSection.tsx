import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, GitBranch, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Section } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/dates";

type SyncStatus = {
  configured: boolean;
  isOwner?: boolean;
  repo?: string;
  repoUrl?: string;
  branch?: string;
  intervalMinutes?: number;
  running: boolean;
  last?: { at: string; ok: boolean; message: string; commitUrl?: string };
};
type SyncResult = { changed: boolean; message: string; commitUrl?: string; status: SyncStatus };

/** Status of the private GitHub mirror, with a "Sync now" button. */
export function GitHubSyncSection() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["sync", "github"],
    queryFn: () => api.get<SyncStatus>("/sync/github"),
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });
  const sync = useMutation({
    mutationFn: () => api.post<SyncResult>("/sync/github"),
    onSuccess: (r) => {
      qc.setQueryData(["sync", "github"], { ...r.status, isOwner: true });
      if (r.changed)
        toast.success(r.message, r.commitUrl ? { action: { label: "View commit", onClick: () => window.open(r.commitUrl, "_blank", "noopener") } } : undefined);
      else toast.info("Already up to date");
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      void status.refetch();
    },
  });

  const s = status.data;
  const busy = sync.isPending || !!s?.running;

  return (
    <Section title="GitHub backup">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <GitBranch className="size-4" />
        </span>
        {status.isLoading ? (
          <Loader2 className="mt-2 size-4 animate-spin text-muted-foreground" />
        ) : s?.configured ? (
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <a href={s.repoUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm font-medium hover:text-primary">
                  {s.repo} <ExternalLink className="size-3.5" />
                </a>
                <p className="text-xs text-muted-foreground">
                  Private mirror of your notes, code, links, drawings and saved PDFs
                  {s.intervalMinutes ? `, synced every ${s.intervalMinutes >= 60 ? `${s.intervalMinutes / 60} h` : `${s.intervalMinutes} min`}` : ""}. Book PDFs stay in DevSpace.
                </p>
              </div>
              <Button size="sm" onClick={() => sync.mutate()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} {busy ? "Syncing…" : "Sync now"}
              </Button>
            </div>
            {s.last ? (
              <p className={`flex items-start gap-1.5 text-xs ${s.last.ok ? "text-muted-foreground" : "text-destructive"}`}>
                {s.last.ok ? <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" /> : <TriangleAlert className="mt-px size-3.5 shrink-0" />}
                <span>
                  {s.last.message} · {timeAgo(s.last.at)}
                  {s.last.commitUrl ? (
                    <>
                      {" · "}
                      <a href={s.last.commitUrl} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                        latest commit
                      </a>
                    </>
                  ) : null}
                </span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No sync since the server started.</p>
            )}
          </div>
        ) : (
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">Not connected</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Mirror everything into a private GitHub repo by setting <code className="rounded bg-muted px-1">GITHUB_SYNC_TOKEN</code> and{" "}
              <code className="rounded bg-muted px-1">GITHUB_SYNC_REPO</code> on the server.
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}
