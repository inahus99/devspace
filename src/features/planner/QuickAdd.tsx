import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { WorkspaceSelect } from "@/components/common/fields";
import { Input } from "@/components/ui/input";
import { useCreate } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Type a task and press Enter to add it to a day, optionally tagged with a workspace. */
export function QuickAdd({ date, className, inline }: { date: string; className?: string; inline?: boolean }) {
  const [title, setTitle] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const create = useCreate("activities");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    create.mutate({ title: t, date, workspaceId }, { onSuccess: () => setTitle("") });
  };
  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-2", inline && "sm:flex-row", className)}>
      <div className="relative flex-1">
        <Plus className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Quick add: type a task, press Enter"
          className="pl-9"
          aria-label="Quick add activity"
          disabled={create.isPending}
        />
      </div>
      <WorkspaceSelect value={workspaceId} onChange={setWorkspaceId} allowNone className={inline ? "sm:w-44" : undefined} />
    </form>
  );
}
