import {
  ArrowLeft, CalendarPlus, CheckCircle2, Code2, ExternalLink, FileCode2, MoreHorizontal, Plus, RotateCcw, SearchX, Star, Trash2, XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  DSA_DIFFICULTIES,
  DSA_DIFFICULTY_LABELS,
  DSA_PLATFORMS,
  DSA_STATUS_LABELS,
  DSA_STATUSES,
  DSA_TOPICS,
  type LanguageId,
  languageLabel,
} from "@shared/constants";
import type { DsaProblem, DsaSolution } from "@shared/types";
import { formatMinutes } from "@shared/time";
import { AttachmentsPanel } from "@/components/common/Attachments";
import { confirm } from "@/components/common/ConfirmDialog";
import { EnumSelect, Field, FolderSelect, TagInput } from "@/components/common/fields";
import { MarkdownField } from "@/components/common/Markdown";
import { DsaStatusPill, Pill } from "@/components/common/Pill";
import { SaveIndicator } from "@/components/common/SaveIndicator";
import { EmptyState, ErrorState, FullPageSpinner, Page, Section } from "@/components/common/states";
import { WorkspaceIcon } from "@/components/common/WorkspaceIcon";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAutosave } from "@/hooks/useAutosave";
import { ApiError } from "@/lib/api";
import { formatDay, relativeDay, timeAgo, todayISO } from "@/lib/dates";
import { useDelete, useItem, useList, useReviewProblem, useSolutionMutations, useSolutions, useUpdate, useWorkspaceMap } from "@/lib/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { isDue } from "./DsaTracker";

export default function DsaProblemPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useItem("dsa", id);

  if (isLoading) return <FullPageSpinner />;
  if (error) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <Page>
          <EmptyState
            icon={SearchX}
            title="Problem not found"
            description="It may have been deleted, or the link is wrong."
            action={
              <Button asChild size="sm" variant="outline">
                <Link to={routes.dashboard()}>Back to dashboard</Link>
              </Button>
            }
          />
        </Page>
      );
    }
    return (
      <Page>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Page>
    );
  }
  if (!data) return null;
  return <ProblemEditor key={data.id} problem={data} />;
}

type TextPatch = Partial<Pick<DsaProblem, "title" | "approach" | "pseudocode" | "timeComplexity" | "spaceComplexity" | "notes" | "platform" | "topic" | "url">>;

function ProblemEditor({ problem }: { problem: DsaProblem }) {
  const navigate = useNavigate();
  const openCapture = useUi((s) => s.openCapture);
  const update = useUpdate("dsa", { silent: true });
  const updateNow = useUpdate("dsa");
  const del = useDelete("dsa");
  const ws = useWorkspaceMap().get(problem.workspaceId);

  const [title, setTitle] = useState(problem.title);
  const [approach, setApproach] = useState(problem.approach);
  const [pseudocode, setPseudocode] = useState(problem.pseudocode);
  const [timeComplexity, setTime] = useState(problem.timeComplexity);
  const [spaceComplexity, setSpace] = useState(problem.spaceComplexity);
  const [notes, setNotes] = useState(problem.notes);
  const [platform, setPlatform] = useState(problem.platform);
  const [topic, setTopic] = useState(problem.topic);
  const [url, setUrl] = useState(problem.url);
  const [urlError, setUrlError] = useState<string | null>(null);

  const autosave = useAutosave<TextPatch>((patch) => update.mutateAsync({ id: problem.id, ...patch }));
  const set = <K extends keyof TextPatch>(key: K, setter: (v: string) => void) => (v: string) => {
    setter(v);
    autosave.schedule({ [key]: v } as TextPatch);
  };

  const backHref = routes.workspace(problem.workspaceId, { tab: "dsa" });

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${problem.title}”?`,
      description: "Its solutions, screenshots and tags are deleted too. Linked activities are kept but unlinked.",
      destructive: true,
    });
    if (!ok) return;
    await del.mutateAsync(problem.id);
    navigate(backHref);
  };

  return (
    <Page>
      {/* Breadcrumb + actions */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          {ws ? <WorkspaceIcon icon={ws.icon} color={ws.color} size="sm" /> : null}
          {ws?.name ?? "Workspace"}
          <span className="text-muted-foreground/60">/ DSA</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <SaveIndicator status={autosave.status} onRetry={() => void autosave.flush()} className="mr-1" />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={problem.isFavorite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={problem.isFavorite}
            onClick={() => updateNow.mutate({ id: problem.id, isFavorite: !problem.isFavorite })}
          >
            <Star className={cn("size-4", problem.isFavorite && "fill-warning text-warning")} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openCapture("activity", { workspaceId: problem.workspaceId, dsaProblemId: problem.id, title: `Practice: ${problem.title}` })}
          >
            <CalendarPlus /> Log activity
          </Button>
          {problem.url ? (
            <Button variant="outline" size="sm" asChild>
              <a href={problem.url} target="_blank" rel="noreferrer noopener">
                <ExternalLink /> Open
              </a>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => openCapture("snippet", { workspaceId: problem.workspaceId, dsaProblemId: problem.id })}>
                <FileCode2 /> New linked snippet
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
                <Trash2 /> Delete problem
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (e.target.value.trim()) autosave.schedule({ title: e.target.value.trim() });
        }}
        onBlur={() => {
          if (!title.trim()) setTitle(problem.title);
        }}
        className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground"
        placeholder="Problem title"
        aria-label="Problem title"
      />
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <DsaStatusPill status={problem.status} />
        {problem.solvedOn ? <span>Solved {formatDay(problem.solvedOn, "MMM d, yyyy")}</span> : null}
        {problem.attemptedOn && !problem.solvedOn ? <span>Attempted {formatDay(problem.attemptedOn, "MMM d, yyyy")}</span> : null}
        <span>· Updated {timeAgo(problem.updatedAt)}</span>
      </div>

      {/* Properties */}
      <div className="mt-5 grid gap-3 rounded-xl border bg-card shadow-soft p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Status">
          <EnumSelect value={problem.status} onChange={(v) => v && updateNow.mutate({ id: problem.id, status: v })} options={DSA_STATUSES} labels={DSA_STATUS_LABELS} />
        </Field>
        <Field label="Difficulty">
          <EnumSelect value={problem.difficulty} onChange={(v) => v && updateNow.mutate({ id: problem.id, difficulty: v })} options={DSA_DIFFICULTIES} labels={DSA_DIFFICULTY_LABELS} />
        </Field>
        <Field label="Platform" htmlFor="p-platform">
          <Input id="p-platform" list="p-platform-options" value={platform} onChange={(e) => set("platform", setPlatform)(e.target.value)} placeholder="LeetCode" />
          <datalist id="p-platform-options">
            {DSA_PLATFORMS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Topic" htmlFor="p-topic">
          <Input id="p-topic" list="p-topic-options" value={topic} onChange={(e) => set("topic", setTopic)(e.target.value)} placeholder="Two Pointers" />
          <datalist id="p-topic-options">
            {DSA_TOPICS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Problem URL" htmlFor="p-url" error={urlError} className="sm:col-span-2">
          <Input
            id="p-url"
            type="url"
            value={url}
            placeholder="https://…"
            aria-invalid={!!urlError}
            onChange={(e) => {
              const v = e.target.value;
              setUrl(v);
              const valid = v.trim() === "" || /^https?:\/\/\S+$/i.test(v.trim());
              setUrlError(valid ? null : "Enter a valid http(s) URL");
              if (valid) autosave.schedule({ url: v.trim() });
            }}
          />
        </Field>
        <Field label="Attempted on" htmlFor="p-attempted">
          <Input
            id="p-attempted"
            type="date"
            value={problem.attemptedOn ?? ""}
            onChange={(e) => updateNow.mutate({ id: problem.id, attemptedOn: e.target.value || null })}
          />
        </Field>
        <Field label="Solved on" htmlFor="p-solved">
          <Input id="p-solved" type="date" value={problem.solvedOn ?? ""} onChange={(e) => updateNow.mutate({ id: problem.id, solvedOn: e.target.value || null })} />
        </Field>
        <Field label="Folder" className="sm:col-span-2">
          <FolderSelect workspaceId={problem.workspaceId} value={problem.folderId} onChange={(v) => updateNow.mutate({ id: problem.id, folderId: v })} />
        </Field>
        <Field label="Tags" className="sm:col-span-2">
          <TagInput value={problem.tags} onChange={(tags) => updateNow.mutate({ id: problem.id, tags })} />
        </Field>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          <Section title="Approach">
            <div className="space-y-4">
              <MarkdownField value={approach} onChange={set("approach", setApproach)} placeholder="Key insight, intuition, edge cases…" minRows={5} uploadTarget={{ dsaProblemId: problem.id }} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Time complexity" htmlFor="p-time">
                  <Input id="p-time" value={timeComplexity} onChange={(e) => set("timeComplexity", setTime)(e.target.value)} placeholder="O(n)" className="font-mono" />
                </Field>
                <Field label="Space complexity" htmlFor="p-space">
                  <Input id="p-space" value={spaceComplexity} onChange={(e) => set("spaceComplexity", setSpace)(e.target.value)} placeholder="O(1)" className="font-mono" />
                </Field>
              </div>
              <MarkdownField label="Pseudocode" value={pseudocode} onChange={set("pseudocode", setPseudocode)} placeholder="Step-by-step outline" mono minRows={4} />
            </div>
          </Section>

          <Solutions problem={problem} />

          <Section title="Notes">
            <MarkdownField value={notes} onChange={set("notes", setNotes)} placeholder="Mistakes made, similar problems, follow-ups…" minRows={4} uploadTarget={{ dsaProblemId: problem.id }} />
          </Section>

          <AttachmentsPanel target={{ dsaProblemId: problem.id }} title="Screenshots & files" />
        </div>

        {/* Side column */}
        <aside className="space-y-4">
          <RevisionPanel problem={problem} />
          <LinkedSnippets problem={problem} />
          <ActivityHistory problemId={problem.id} />
        </aside>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Solutions
// ---------------------------------------------------------------------------

function Solutions({ problem }: { problem: DsaProblem }) {
  const { data, isLoading } = useSolutions(problem.id);
  const { create } = useSolutionMutations(problem.id);
  const [activeId, setActiveId] = useState<string | null>(null);
  const solutions = useMemo(() => data ?? [], [data]);
  const active = solutions.find((s) => s.id === activeId) ?? solutions[0];

  useEffect(() => {
    if (activeId && !solutions.some((s) => s.id === activeId)) setActiveId(null);
  }, [solutions, activeId]);

  const add = async () => {
    const last = solutions.at(-1);
    const row = await create.mutateAsync({ language: (last?.language as LanguageId | undefined) ?? "cpp", code: "" });
    setActiveId(row.id);
  };

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <header className="flex items-center gap-2 border-b px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="tablist" aria-label="Solutions">
          {solutions.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active?.id === s.id}
              onClick={() => setActiveId(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
                active?.id === s.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Code2 className="size-3.5" />
              {s.title || "Solution"}
              <span className="text-2xs text-muted-foreground">{languageLabel(s.language)}</span>
            </button>
          ))}
          {!isLoading && solutions.length === 0 ? <span className="px-2 text-sm font-medium">Solutions</span> : null}
        </div>
        <Button size="xs" variant="ghost" onClick={() => void add()} disabled={create.isPending}>
          <Plus /> Add solution
        </Button>
      </header>
      {isLoading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading solutions…</div>
      ) : !active ? (
        <div className="p-4">
          <EmptyState
            icon={Code2}
            compact
            title="No solutions yet"
            description="Add one solution per approach or language — brute force, optimal, in C++ and Java…"
            action={
              <Button size="sm" onClick={() => void add()} disabled={create.isPending}>
                <Plus /> Add solution
              </Button>
            }
          />
        </div>
      ) : (
        <SolutionEditor key={active.id} problemId={problem.id} solution={active} />
      )}
    </section>
  );
}

type SolutionPatch = Partial<Pick<DsaSolution, "title" | "code" | "timeComplexity" | "spaceComplexity" | "notes">> & { language?: LanguageId };

function SolutionEditor({ problemId, solution }: { problemId: string; solution: DsaSolution }) {
  const { update, remove } = useSolutionMutations(problemId);
  const [title, setTitle] = useState(solution.title);
  const [language, setLanguage] = useState(solution.language);
  const [code, setCode] = useState(solution.code);
  const [time, setTime] = useState(solution.timeComplexity);
  const [space, setSpace] = useState(solution.spaceComplexity);
  const [notes, setNotes] = useState(solution.notes);
  const autosave = useAutosave<SolutionPatch>((patch) => update.mutateAsync({ id: solution.id, ...patch }));

  const del = async () => {
    if (await confirm({ title: `Delete “${solution.title}”?`, description: "This solution's code and notes will be removed.", destructive: true })) {
      await autosave.flush();
      remove.mutate(solution.id);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) autosave.schedule({ title: e.target.value.trim() });
          }}
          className="h-8 max-w-60 font-medium"
          aria-label="Solution name"
        />
        <Input
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            autosave.schedule({ timeComplexity: e.target.value });
          }}
          placeholder="Time O(…)"
          className="h-8 w-32 font-mono text-xs"
          aria-label="Time complexity"
        />
        <Input
          value={space}
          onChange={(e) => {
            setSpace(e.target.value);
            autosave.schedule({ spaceComplexity: e.target.value });
          }}
          placeholder="Space O(…)"
          className="h-8 w-32 font-mono text-xs"
          aria-label="Space complexity"
        />
        <div className="ml-auto flex items-center gap-2">
          <SaveIndicator status={autosave.status} onRetry={() => void autosave.flush()} />
          <Button size="icon-sm" variant="ghost" onClick={() => void del()} aria-label="Delete solution">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <CodeEditor
        value={code}
        onChange={(v) => {
          setCode(v);
          autosave.schedule({ code: v });
        }}
        language={language}
        onLanguageChange={(v) => {
          setLanguage(v);
          autosave.schedule({ language: v as LanguageId });
        }}
        height="auto"
        maxHeight={560}
      />
      <MarkdownField label="Solution notes" value={notes} onChange={(v) => { setNotes(v); autosave.schedule({ notes: v }); }} placeholder="Why it works, pitfalls…" minRows={2} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side panels
// ---------------------------------------------------------------------------

function RevisionPanel({ problem }: { problem: DsaProblem }) {
  const review = useReviewProblem();
  const update = useUpdate("dsa");
  const today = todayISO();
  const due = isDue(problem, today);
  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <RotateCcw className="size-3.5 text-muted-foreground" /> Revision
        </h2>
        {due ? <Pill tone="warning">Due</Pill> : problem.nextReviewOn ? <Pill tone="neutral">Scheduled</Pill> : null}
      </header>
      <div className="space-y-3 p-4 text-sm">
        <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Reviews</dt>
          <dd className="text-right tabular">{problem.reviewCount}</dd>
          <dt className="text-muted-foreground">Last reviewed</dt>
          <dd className="text-right">{problem.lastReviewedOn ? relativeDay(problem.lastReviewedOn) : "Never"}</dd>
          <dt className="text-muted-foreground">Next review</dt>
          <dd className={cn("text-right", due && "text-warning")}>{problem.nextReviewOn ? relativeDay(problem.nextReviewOn) : "—"}</dd>
        </dl>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ id: problem.id, date: today, success: true })}>
            <CheckCircle2 className="text-success" /> Recalled it
          </Button>
          <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ id: problem.id, date: today, success: false })}>
            <XCircle className="text-warning" /> Struggled
          </Button>
        </div>
        <Field label="Reschedule review" htmlFor="p-next">
          <Input
            id="p-next"
            type="date"
            className="h-8"
            value={problem.nextReviewOn ?? ""}
            onChange={(e) => update.mutate({ id: problem.id, nextReviewOn: e.target.value || null })}
          />
        </Field>
        <p className="text-2xs text-muted-foreground">Recalling pushes the next review out (1 → 3 → 7 → 14 → 30 → 60 days). Struggling marks it for revision tomorrow.</p>
      </div>
    </section>
  );
}

function LinkedSnippets({ problem }: { problem: DsaProblem }) {
  const openCapture = useUi((s) => s.openCapture);
  const { data } = useList("snippets", { dsaProblemId: problem.id });
  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <FileCode2 className="size-3.5 text-muted-foreground" /> Linked snippets
        </h2>
        <Button size="xs" variant="ghost" onClick={() => openCapture("snippet", { workspaceId: problem.workspaceId, dsaProblemId: problem.id })}>
          <Plus /> New
        </Button>
      </header>
      <div className="p-2">
        {!data?.length ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Reusable templates (e.g. a binary-search skeleton) linked to this problem appear here.</p>
        ) : (
          <ul>
            {data.map((s) => (
              <li key={s.id}>
                <Link to={routes.snippet(s.id)} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                  <span className="truncate">{s.title}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground">{languageLabel(s.language)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ActivityHistory({ problemId }: { problemId: string }) {
  const { data } = useList("activities", { dsaProblemId: problemId });
  const list = useMemo(() => [...(data ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), [data]);
  if (!list.length) return null;
  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <header className="border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">Practice sessions</h2>
      </header>
      <ul className="divide-y text-sm">
        {list.map((a) => (
          <li key={a.id} className="flex items-center gap-2 px-4 py-2">
            {a.completed ? <CheckCircle2 className="size-3.5 shrink-0 text-success" /> : <span className="size-3.5 shrink-0 rounded-full border" />}
            <Link to={routes.planner(a.date)} className="min-w-0 flex-1 truncate hover:underline">
              {a.title}
            </Link>
            <span className="shrink-0 text-2xs text-muted-foreground">
              {relativeDay(a.date)}
              {a.completed && a.actualMinutes ? ` · ${formatMinutes(a.actualMinutes)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
