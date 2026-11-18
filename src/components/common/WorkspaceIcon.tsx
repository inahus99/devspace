import {
  Atom, BookOpen, Bot, Boxes, Brain, Braces, Binary, Code2, Coffee, Cpu, Database, FileCode2, Flame, Folder, GitBranch,
  Globe, Layers, Layout, Lightbulb, type LucideIcon, Network, Puzzle, Rocket, Server, Shield, Sigma, Sparkles, Terminal,
  Workflow, Wrench, Zap, Cloud, Container, Gauge, GraduationCap, Hash, Microscope, Palette, PenTool, Smartphone,
} from "lucide-react";
import { WORKSPACE_COLORS } from "@shared/constants";
import { cn } from "@/lib/utils";

/** Curated icon set for workspaces (stored by name so it survives export). */
export const WORKSPACE_ICONS: Record<string, LucideIcon> = {
  folder: Folder, binary: Binary, boxes: Boxes, brain: Brain, bot: Bot, zap: Zap, coffee: Coffee, network: Network,
  sigma: Sigma, code: Code2, braces: Braces, terminal: Terminal, database: Database, server: Server, cloud: Cloud,
  container: Container, cpu: Cpu, layers: Layers, workflow: Workflow, "git-branch": GitBranch, globe: Globe,
  layout: Layout, smartphone: Smartphone, shield: Shield, gauge: Gauge, atom: Atom, microscope: Microscope,
  sparkles: Sparkles, lightbulb: Lightbulb, rocket: Rocket, flame: Flame, puzzle: Puzzle, wrench: Wrench,
  "file-code": FileCode2, book: BookOpen, "graduation-cap": GraduationCap, hash: Hash, palette: Palette, pen: PenTool,
};

export function iconFor(name: string | null | undefined): LucideIcon {
  return (name && WORKSPACE_ICONS[name]) || Folder;
}

export function WorkspaceIcon({
  icon,
  color,
  className,
  size = "md",
}: {
  icon: string;
  color: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const Icon = iconFor(icon);
  const box = size === "sm" ? "size-5 rounded" : size === "lg" ? "size-10 rounded-lg" : "size-6 rounded-md";
  const glyph = size === "sm" ? "size-3" : size === "lg" ? "size-5" : "size-3.5";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", box, className)}
      style={{ backgroundColor: `${color}1f`, color }}
      aria-hidden
    >
      <Icon className={glyph} strokeWidth={2.2} />
    </span>
  );
}

export function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label="Icon">
      {Object.entries(WORKSPACE_ICONS).map(([name, Icon]) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          aria-label={name}
          onClick={() => onChange(name)}
          className={cn(
            "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            value === name && "bg-accent ring-1 ring-border",
          )}
          style={value === name ? { color } : undefined}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
      {WORKSPACE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn(
            "size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow",
            value === c ? "ring-2" : "hover:ring-2 hover:ring-border",
          )}
          style={{ backgroundColor: c, ["--tw-ring-color" as string]: value === c ? c : undefined }}
        />
      ))}
    </div>
  );
}
