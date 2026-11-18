import { AtSign, BookOpenText, CirclePlay, FileText, GitBranch, GraduationCap, Link2, type LucideIcon, Newspaper } from "lucide-react";
import type { ResourceType } from "@shared/constants";
import { cn } from "@/lib/utils";

export const RESOURCE_TYPE_ICONS: Record<ResourceType, LucideIcon> = {
  youtube: CirclePlay,
  twitter: AtSign,
  github: GitBranch,
  docs: BookOpenText,
  article: Newspaper,
  course: GraduationCap,
  pdf: FileText,
  other: Link2,
};

const TYPE_COLORS: Record<ResourceType, string> = {
  youtube: "text-destructive bg-destructive/10",
  twitter: "text-foreground bg-muted",
  github: "text-foreground bg-muted",
  docs: "text-info bg-info/12",
  article: "text-warning bg-warning/12",
  course: "text-plum bg-plum/12",
  pdf: "text-brand bg-brand-soft",
  other: "text-muted-foreground bg-muted",
};

export function ResourceTypeIcon({ type, className }: { type: ResourceType; className?: string }) {
  const Icon = RESOURCE_TYPE_ICONS[type];
  return (
    <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md", TYPE_COLORS[type], className)} aria-hidden>
      <Icon className="size-3.5" />
    </span>
  );
}
