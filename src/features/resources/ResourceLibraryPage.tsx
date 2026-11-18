import { Plus, Rows3, Layers } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { RESOURCE_STATUS_LABELS, RESOURCE_STATUSES } from "@shared/constants";
import { Page, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useList } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { ResourceList } from "./ResourceList";

export default function ResourceLibraryPage() {
  const [params] = useSearchParams();
  const highlight = params.get("highlight") ?? undefined;
  const [grouped, setGrouped] = useState(false);
  const openCapture = useUi((s) => s.openCapture);
  const { data } = useList("resources");

  const counts = Object.fromEntries(RESOURCE_STATUSES.map((s) => [s, (data ?? []).filter((r) => r.status === s).length]));

  return (
    <Page>
      <PageHeader
        title="Resource Library"
        description={
          data ? (
            <span className="flex flex-wrap gap-x-3">
              <span>{data.length} saved</span>
              {RESOURCE_STATUSES.map((s) => (
                <span key={s}>
                  {counts[s]} {RESOURCE_STATUS_LABELS[s].toLowerCase()}
                </span>
              ))}
            </span>
          ) : (
            "Everything you've saved, across all workspaces."
          )
        }
        actions={
          <>
            <div className="flex rounded-md border p-0.5" role="group" aria-label="Layout">
              <button
                type="button"
                onClick={() => setGrouped(false)}
                aria-pressed={!grouped}
                className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs", !grouped ? "bg-accent" : "text-muted-foreground")}
              >
                <Rows3 className="size-3.5" /> List
              </button>
              <button
                type="button"
                onClick={() => setGrouped(true)}
                aria-pressed={grouped}
                className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs", grouped ? "bg-accent" : "text-muted-foreground")}
              >
                <Layers className="size-3.5" /> By workspace
              </button>
            </div>
            <Button size="sm" onClick={() => openCapture("resource")}>
              <Plus /> Add resource
            </Button>
          </>
        }
      />
      <ResourceList highlightId={highlight} groupByWorkspace={grouped} />
    </Page>
  );
}
