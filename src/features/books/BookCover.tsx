import { useState } from "react";
import { cn } from "@/lib/utils";

const PALETTE = [
  ["#1e293b", "#cbd5e1"],
  ["#3f2d56", "#ddd0f0"],
  ["#14403b", "#bfe6dc"],
  ["#4a2a1e", "#f1d3c2"],
  ["#1d3557", "#c9dcf2"],
  ["#3d3d1f", "#e7e5be"],
  ["#4a1d2e", "#f0c9d6"],
  ["#22343c", "#c6dde6"],
] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(title: string): string {
  const words = title.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?").slice(0, 2);
}

/** Cover image, or a quiet typographic cover generated from the title. */
export function BookCover({
  title,
  author,
  coverUrl,
  className,
  size = "md",
}: {
  title: string;
  author: string;
  coverUrl: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const base = cn("relative aspect-[2/3] w-full overflow-hidden rounded-md border shadow-xs", className);
  if (coverUrl && !failed) {
    return (
      <div className={base}>
        <img src={coverUrl} alt={`Cover of ${title}`} loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
      </div>
    );
  }
  const [bg, fg] = PALETTE[hash(title) % PALETTE.length]!;
  return (
    <div className={cn(base, "flex flex-col justify-between p-[10%]")} style={{ backgroundColor: bg, color: fg }} aria-label={`Cover of ${title}`} role="img">
      <div className="absolute inset-y-0 left-[6%] w-px opacity-30" style={{ backgroundColor: fg }} />
      <div className={cn("font-semibold tracking-tight opacity-90", size === "sm" ? "text-lg" : size === "lg" ? "text-4xl" : "text-2xl")}>{initials(title)}</div>
      {size !== "sm" ? (
        <div className="space-y-1">
          <div className={cn("line-clamp-3 font-medium leading-snug", size === "lg" ? "text-base" : "text-xs")}>{title}</div>
          {author ? <div className={cn("line-clamp-1 opacity-70", size === "lg" ? "text-sm" : "text-2xs")}>{author}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export function percent(current: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${value}%` }} />
    </div>
  );
}
