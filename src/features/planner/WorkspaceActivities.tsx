import { CalendarCheck, Plus } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { formatMinutes, totalsByDate } from "@shared/time";
import { EmptyState, ErrorState, LoadingRows, Section } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/dates";
import { useList } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { useUi } from "@/stores/ui";
import { ActivityItem } from "./ActivityItem";
import { sortActivities } from "./lib";

export function WorkspaceActivities({ workspaceId }: { workspaceId: string }) {
  const openCapture = useUi((s) => s.openCapture);
  const { data, isLoading, error, refetch } = useList("activities", { workspaceId });
  const today = todayISO();

  const { upcoming, past, totals } = useMemo(() => {
    const all = sortActivities(data ?? []);
    const upcoming = all.filter((a) => a.date > today || (a.date === today && !a.completed));
    const past = all.filter((a) => !upcoming.includes(a)).reverse();
    let minutes = 0;
    let completed = 0;
    for (const t of totalsByDate(all).values()) {
      minutes += t.byWorkspace[workspaceId] ?? 0;
      completed += t.completed;
    }
    return { upcoming, past, totals: { minutes: Math.round(minutes), completed, total: all.length } };
  }, [data, today, workspaceId]);

  const add = (
    <Button size="sm" onClick={() => openCapture("activity", { workspaceId })}>
      <Plus /> Add activity
    </Button>
  );

  if (isLoading) return <LoadingRows rows={4} />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data?.length)
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No activities yet"
        description="Plan study sessions for this workspace. They appear in the daily planner, master calendar and analytics automatically."
        action={add}
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular">{totals.completed}</span> of {totals.total} completed ·{" "}
          <span className="font-medium text-foreground tabular">{formatMinutes(totals.minutes)}</span> recorded
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={routes.calendar()}>Open calendar</Link>
          </Button>
          {add}
        </div>
      </div>
      <Section title={`Upcoming (${upcoming.length})`} bodyClassName="p-1.5">
        {upcoming.length ? (
          upcoming.slice(0, 30).map((a) => <ActivityItem key={a.id} activity={a} showDate />)
        ) : (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nothing planned. Add the next session to keep momentum.</p>
        )}
      </Section>
      {past.length ? (
        <Section title={`History (${past.length})`} bodyClassName="p-1.5">
          {past.slice(0, 50).map((a) => (
            <ActivityItem key={a.id} activity={a} showDate />
          ))}
          {past.length > 50 ? <p className="px-2 py-2 text-xs text-muted-foreground">Showing the 50 most recent. See analytics for the full history.</p> : null}
        </Section>
      ) : null}
    </div>
  );
}
