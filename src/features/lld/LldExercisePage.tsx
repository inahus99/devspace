import { ArrowLeft, CalendarPlus, MoreHorizontal, Plus, SearchX, Star, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  DESIGN_PATTERNS,
  DSA_DIFFICULTIES,
  DSA_DIFFICULTY_LABELS,
  type LanguageId,
  LLD_STATUS_LABELS,
  LLD_STATUSES,
  SOLID_PRINCIPLES,
} from "@shared/constants";
import type { LldExercise } from "@shared/types";
import { AttachmentsPanel } from "@/components/common/Attachments";
import { confirm } from "@/components/common/ConfirmDialog";
import { ChipMultiSelect, EnumSelect, Field, FolderSelect, TagInput } from "@/components/common/fields";
import { MarkdownField } from "@/components/common/Markdown";
import { LldStatusPill } from "@/components/common/Pill";
import { SaveIndicator } from "@/components/common/SaveIndicator";
import { EmptyState, ErrorState, FullPageSpinner, Page } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAutosave } from "@/hooks/useAutosave";
import { ApiError } from "@/lib/api";
import { formatDay, timeAgo } from "@/lib/dates";
import { useDelete, useItem, useUpdate, useWorkspaceMap } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";

export default function LldExercisePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useItem("lld", id);
  if (isLoading) return <FullPageSpinner />;
  if (error) {
    return (
      <Page>
        {error instanceof ApiError && error.status === 404 ? (
          <EmptyState
            icon={SearchX}
            title="Exercise not found"
            description="It may have been deleted, or the link is wrong."
            action={
              <Button asChild size="sm" variant="outline">
                <Link to={routes.dashboard()}>Back to dashboard</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={error} onRetry={() => void refetch()} />
        )}
      </Page>
    );
  }
  if (!data) return null;
  return <ExerciseEditor key={data.id} exercise={data} />;
}

const SECTIONS = [
  { id: "statement", label: "Problem statement" },
  { id: "requirements", label: "Requirements" },
  { id: "entities", label: "Classes & entities" },
  { id: "diagrams", label: "UML & diagrams" },
  { id: "patterns", label: "Patterns & SOLID" },
  { id: "implementation", label: "Implementation" },
  { id: "tradeoffs", label: "Trade-offs" },
  { id: "interview", label: "Interview notes" },
] as const;

type Patch = Partial<
  Pick<
    LldExercise,
    | "title"
    | "problemStatement"
    | "functionalRequirements"
    | "nonFunctionalRequirements"
    | "entities"
    | "diagramSource"
    | "designPatterns"
    | "implementationCode"
    | "tradeOffs"
    | "interviewNotes"
  >
> & { implementationLanguage?: LanguageId; solidPrinciples?: ("S" | "O" | "L" | "I" | "D")[] };

function ExerciseEditor({ exercise: ex }: { exercise: LldExercise }) {
  const navigate = useNavigate();
  const openCapture = useUi((s) => s.openCapture);
  const update = useUpdate("lld", { silent: true });
  const updateNow = useUpdate("lld");
  const del = useDelete("lld");
  const ws = useWorkspaceMap().get(ex.workspaceId);
  const autosave = useAutosave<Patch>((patch) => update.mutateAsync({ id: ex.id, ...patch }));

  const [title, setTitle] = useState(ex.title);
  const [fields, setFields] = useState({
    problemStatement: ex.problemStatement,
    functionalRequirements: ex.functionalRequirements,
    nonFunctionalRequirements: ex.nonFunctionalRequirements,
    entities: ex.entities,
    diagramSource: ex.diagramSource,
    tradeOffs: ex.tradeOffs,
    interviewNotes: ex.interviewNotes,
    implementationCode: ex.implementationCode,
  });
  const [language, setLanguage] = useState(ex.implementationLanguage);
  const [patterns, setPatterns] = useState<string[]>(ex.designPatterns);
  const [solid, setSolid] = useState<string[]>(ex.solidPrinciples);
  const [customPattern, setCustomPattern] = useState("");

  const text = (key: keyof typeof fields) => (v: string) => {
    setFields((f) => ({ ...f, [key]: v }));
    autosave.schedule({ [key]: v } as Patch);
  };

  const patternOptions = [...DESIGN_PATTERNS, ...patterns.filter((p) => !(DESIGN_PATTERNS as readonly string[]).includes(p))];
  const setPatternList = (v: string[]) => {
    setPatterns(v);
    autosave.schedule({ designPatterns: v });
  };
  const addCustomPattern = () => {
    const p = customPattern.trim();
    if (p && !patterns.includes(p)) setPatternList([...patterns, p]);
    setCustomPattern("");
  };

  const backHref = routes.workspace(ex.workspaceId, { tab: "lld" });
  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${ex.title}”?`,
      description: "All requirements, diagrams, screenshots and code for this exercise are permanently deleted.",
      destructive: true,
    });
    if (!ok) return;
    await del.mutateAsync(ex.id);
    navigate(backHref);
  };

  return (
    <Page wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          {ws ? <WorkspaceIcon icon={ws.icon} color={ws.color} size="sm" /> : null}
          {ws?.name ?? "Workspace"}
          <span className="text-muted-foreground/60">/ Design exercises</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <SaveIndicator status={autosave.status} onRetry={() => void autosave.flush()} className="mr-1" />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={ex.isFavorite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={ex.isFavorite}
            onClick={() => updateNow.mutate({ id: ex.id, isFavorite: !ex.isFavorite })}
          >
            <Star className={cn("size-4", ex.isFavorite && "fill-warning text-warning")} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openCapture("activity", { workspaceId: ex.workspaceId, lldExerciseId: ex.id, title: `Design: ${ex.title}` })}
          >
            <CalendarPlus /> Log activity
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
                <Trash2 /> Delete exercise
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (e.target.value.trim()) autosave.schedule({ title: e.target.value.trim() });
        }}
        onBlur={() => !title.trim() && setTitle(ex.title)}
        className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none"
        placeholder="Exercise title"
        aria-label="Exercise title"
      />
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <LldStatusPill status={ex.status} />
        {ex.completedOn ? <span>Completed {formatDay(ex.completedOn, "MMM d, yyyy")}</span> : null}
        <span>· Updated {timeAgo(ex.updatedAt)}</span>
      </div>

      <div className="mt-5 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Status">
          <EnumSelect value={ex.status} onChange={(v) => v && updateNow.mutate({ id: ex.id, status: v })} options={LLD_STATUSES} labels={LLD_STATUS_LABELS} />
        </Field>
        <Field label="Difficulty">
          <EnumSelect
            value={ex.difficulty}
            onChange={(v) => updateNow.mutate({ id: ex.id, difficulty: v })}
            options={DSA_DIFFICULTIES}
            labels={DSA_DIFFICULTY_LABELS}
            allowNone
            noneLabel="Not set"
          />
        </Field>
        <Field label="Folder">
          <FolderSelect workspaceId={ex.workspaceId} value={ex.folderId} onChange={(v) => updateNow.mutate({ id: ex.id, folderId: v })} />
        </Field>
        <Field label="Tags">
          <TagInput value={ex.tags} onChange={(tags) => updateNow.mutate({ id: ex.id, tags })} />
        </Field>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav className="hidden lg:block" aria-label="Sections">
          <ul className="sticky top-6 space-y-0.5 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-8">
          <Block id="statement" title="Problem statement">
            <MarkdownField value={fields.problemStatement} onChange={text("problemStatement")} placeholder="What are we designing? Scope, actors, constraints…" minRows={4} uploadTarget={{ lldExerciseId: ex.id }} />
          </Block>

          <Block id="requirements" title="Requirements">
            <div className="grid gap-4 xl:grid-cols-2">
              <MarkdownField label="Functional" value={fields.functionalRequirements} onChange={text("functionalRequirements")} placeholder={"- Users can park a vehicle\n- …"} minRows={5} />
              <MarkdownField label="Non-functional" value={fields.nonFunctionalRequirements} onChange={text("nonFunctionalRequirements")} placeholder={"- Thread-safe slot allocation\n- Extensible pricing"} minRows={5} />
            </div>
          </Block>

          <Block id="entities" title="Classes & entities">
            <MarkdownField
              value={fields.entities}
              onChange={text("entities")}
              placeholder={"**ParkingLot** — floors, entry/exit gates\n**ParkingSpot** — id, type, isFree()\n…"}
              minRows={5}
            />
          </Block>

          <Block id="diagrams" title="UML & class diagrams">
            <div className="space-y-4">
              <AttachmentsPanel
                target={{ lldExerciseId: ex.id }}
                title="Diagrams & screenshots"
                emptyHint="Drop or paste class diagrams, sequence diagrams and whiteboard photos."
              />
              <MarkdownField
                label="Diagram source (Mermaid / PlantUML)"
                value={fields.diagramSource}
                onChange={text("diagramSource")}
                placeholder={"classDiagram\n  ParkingLot --> Floor\n  Floor --> ParkingSpot"}
                mono
                minRows={4}
              />
            </div>
          </Block>

          <Block id="patterns" title="Design patterns & SOLID">
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Design patterns used</p>
                <ChipMultiSelect options={patternOptions} value={patterns} onChange={setPatternList} />
                <form
                  className="flex max-w-sm gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addCustomPattern();
                  }}
                >
                  <Input value={customPattern} onChange={(e) => setCustomPattern(e.target.value)} placeholder="Add a custom pattern…" className="h-8" maxLength={60} />
                  <Button type="submit" size="sm" variant="outline" disabled={!customPattern.trim()}>
                    <Plus /> Add
                  </Button>
                </form>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">SOLID principles applied</p>
                <ChipMultiSelect
                  options={SOLID_PRINCIPLES.map((p) => p.id)}
                  labels={Object.fromEntries(SOLID_PRINCIPLES.map((p) => [p.id, `${p.id} · ${p.label}`]))}
                  value={solid}
                  onChange={(v) => {
                    setSolid(v);
                    autosave.schedule({ solidPrinciples: v as ("S" | "O" | "L" | "I" | "D")[] });
                  }}
                />
              </div>
            </div>
          </Block>

          <Block id="implementation" title="Implementation">
            <CodeEditor
              value={fields.implementationCode}
              onChange={text("implementationCode")}
              language={language}
              onLanguageChange={(v) => {
                setLanguage(v);
                autosave.schedule({ implementationLanguage: v as LanguageId });
              }}
              height="auto"
              maxHeight={720}
            />
          </Block>

          <Block id="tradeoffs" title="Trade-offs">
            <MarkdownField value={fields.tradeOffs} onChange={text("tradeOffs")} placeholder="Alternatives considered and why this design won…" minRows={4} />
          </Block>

          <Block id="interview" title="Interview notes">
            <MarkdownField
              value={fields.interviewNotes}
              onChange={text("interviewNotes")}
              placeholder="Clarifying questions to ask, follow-ups, how to present it in 45 minutes…"
              minRows={4}
            />
          </Block>
        </div>
      </div>
    </Page>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="mb-3 border-b pb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
