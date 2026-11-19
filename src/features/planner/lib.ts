import { formatTime12, formatTimeRange12 } from "@shared/time";
import { BookOpen, Boxes, Code2, FileText, Link2, type LucideIcon, Target } from "lucide-react";
import type { ActivityLinkType, ActivityWithLink } from "@shared/types";
import type { EntityName } from "@/lib/queries";

export const LINK_TYPES: {
  type: ActivityLinkType;
  label: string;
  entity: EntityName;
  field: "noteId" | "dsaProblemId" | "lldExerciseId" | "snippetId" | "resourceId" | "bookId";
  icon: LucideIcon;
  /** Whether items carry a workspace we can filter by. */
  workspaceScoped: boolean;
}[] = [
  { type: "note", label: "Note", entity: "notes", field: "noteId", icon: FileText, workspaceScoped: true },
  { type: "dsa", label: "DSA problem", entity: "dsa", field: "dsaProblemId", icon: Target, workspaceScoped: true },
  { type: "lld", label: "LLD exercise", entity: "lld", field: "lldExerciseId", icon: Boxes, workspaceScoped: true },
  { type: "snippet", label: "Code snippet", entity: "snippets", field: "snippetId", icon: Code2, workspaceScoped: true },
  { type: "resource", label: "Resource", entity: "resources", field: "resourceId", icon: Link2, workspaceScoped: true },
  { type: "book", label: "Book", entity: "books", field: "bookId", icon: BookOpen, workspaceScoped: false },
];

export const LINK_FIELDS = LINK_TYPES.map((l) => l.field);

export function linkMeta(type: ActivityLinkType) {
  return LINK_TYPES.find((l) => l.type === type)!;
}

/** Determine the link (type + id) of an activity from its explicit FK columns. */
export function activityLinkRef(a: Partial<ActivityWithLink>): { type: ActivityLinkType; id: string } | null {
  for (const l of LINK_TYPES) {
    const id = a[l.field];
    if (typeof id === "string" && id) return { type: l.type, id };
  }
  return null;
}

/** Sort: timed first by start time, then untimed by creation. */
export function sortActivities<T extends { startTime: string | null; createdAt: string; date: string }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.startTime ?? "99").localeCompare(b.startTime ?? "99") ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export function timeLabel(a: { startTime: string | null; endTime: string | null }): string {
  if (a.startTime && a.endTime) return formatTimeRange12(a.startTime, a.endTime);
  if (a.startTime) return formatTime12(a.startTime);
  return "";
}
