import type { ReactNode } from "react";
import {
  BOOK_STATUS_LABELS,
  type BookStatus,
  DSA_DIFFICULTY_LABELS,
  DSA_STATUS_LABELS,
  type DsaDifficulty,
  type DsaStatus,
  LLD_STATUS_LABELS,
  type LldStatus,
  RESOURCE_STATUS_LABELS,
  type ResourceStatus,
} from "@shared/constants";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "violet";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-brand-soft text-brand",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/12 text-destructive",
  info: "bg-info/14 text-info",
  violet: "bg-plum/12 text-plum",
};

export function Pill({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-2xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export const DSA_STATUS_TONE: Record<DsaStatus, Tone> = {
  todo: "neutral",
  attempted: "info",
  solved: "success",
  needs_revision: "warning",
  mastered: "violet",
};
export const DSA_DIFFICULTY_TONE: Record<DsaDifficulty, Tone> = { easy: "success", medium: "warning", hard: "danger" };
export const LLD_STATUS_TONE: Record<LldStatus, Tone> = { todo: "neutral", in_progress: "info", completed: "success", needs_revision: "warning" };
export const RESOURCE_STATUS_TONE: Record<ResourceStatus, Tone> = { unread: "neutral", in_progress: "info", completed: "success" };
export const BOOK_STATUS_TONE: Record<BookStatus, Tone> = {
  want_to_read: "neutral",
  reading: "info",
  completed: "success",
  paused: "warning",
  abandoned: "danger",
};

export const DsaStatusPill = ({ status }: { status: DsaStatus }) => <Pill tone={DSA_STATUS_TONE[status]} dot>{DSA_STATUS_LABELS[status]}</Pill>;
export const DifficultyPill = ({ difficulty }: { difficulty: DsaDifficulty }) => (
  <Pill tone={DSA_DIFFICULTY_TONE[difficulty]}>{DSA_DIFFICULTY_LABELS[difficulty]}</Pill>
);
export const LldStatusPill = ({ status }: { status: LldStatus }) => <Pill tone={LLD_STATUS_TONE[status]} dot>{LLD_STATUS_LABELS[status]}</Pill>;
export const ResourceStatusPill = ({ status }: { status: ResourceStatus }) => (
  <Pill tone={RESOURCE_STATUS_TONE[status]} dot>{RESOURCE_STATUS_LABELS[status]}</Pill>
);
export const BookStatusPill = ({ status }: { status: BookStatus }) => <Pill tone={BOOK_STATUS_TONE[status]} dot>{BOOK_STATUS_LABELS[status]}</Pill>;
