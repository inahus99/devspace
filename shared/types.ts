// API response types. Derived from the Drizzle schema (type-only import, so no
// server code reaches the client bundle). Dates arrive as ISO strings over JSON.
import type * as S from "../server/db/schema.ts";

type Serialized<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};
type Tagged<T> = Serialized<T> & { tags: string[] };

export type UserSettings = S.UserSettings;
export type User = Omit<Serialized<S.User>, "passwordHash">;
export type Workspace = Serialized<S.Workspace>;
export type Folder = Serialized<S.Folder>;
export type Note = Tagged<S.Note>;
export type NoteSummary = Omit<Note, "contentJson" | "contentHtml" | "contentMarkdown" | "plainText"> & {
  excerpt: string;
};
export type CodeSnippet = Tagged<S.CodeSnippet>;
export type Diagram = Serialized<S.Diagram>;
export type DiagramSummary = Omit<Diagram, "scene">;
export type Resource = Tagged<S.Resource>;
export type DsaProblem = Tagged<S.DsaProblem>;
export type DsaSolution = Serialized<S.DsaSolution>;
export type LldExercise = Tagged<S.LldExercise>;
export type Book = Tagged<S.Book>;
export type BookHighlight = Serialized<S.BookHighlight>;
export type ReadingLog = Serialized<S.ReadingLog>;
export type Attachment = Serialized<S.Attachment> & { url: string };
export type Activity = Serialized<S.Activity>;
export type Tag = Serialized<S.Tag> & { count: number };

export type SearchResultType = "workspace" | "folder" | "note" | "snippet" | "dsa" | "lld" | "resource" | "book";
export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceColor: string | null;
}

export interface WorkspaceSummary {
  workspaceId: string;
  notes: number;
  snippets: number;
  resources: number;
  dsaProblems: number;
  lldExercises: number;
  activitiesTotal: number;
  activitiesCompleted: number;
  /** Actual recorded minutes, all time. */
  minutes: number;
  /** done / total trackable items (activities, resources, DSA, LLD). null when nothing to track. */
  progress: number | null;
  lastActivityAt: string | null;
}

export interface DayStat {
  date: string;
  plannedMinutes: number;
  /** Overlap-safe actual minutes. */
  actualMinutes: number;
  completed: number;
  total: number;
  /** Overlap-safe actual minutes per workspace id ("none" for unassigned). */
  byWorkspace: Record<string, number>;
}

export interface StatsResponse {
  from: string;
  to: string;
  days: DayStat[];
  totals: { plannedMinutes: number; actualMinutes: number; completed: number; total: number };
  streak: { current: number; longest: number };
  byWorkspace: { workspaceId: string; minutes: number; completed: number; total: number }[];
  dsa: {
    total: number;
    solved: number;
    solvedInRange: number;
    needsRevision: number;
    dueForReview: number;
    byStatus: Record<string, number>;
    byDifficulty: Record<string, number>;
    byTopic: { topic: string; count: number; solved: number }[];
    solvedPerDay: Record<string, number>;
  };
  reading: {
    pagesInRange: number;
    pagesPerDay: Record<string, number>;
    byStatus: Record<string, number>;
    completedInRange: number;
  };
}

export interface DashboardResponse {
  today: string;
  todayActivities: Activity[];
  upcoming: Activity[];
  recentNotes: NoteSummary[];
  recentResources: Resource[];
  readingBooks: Book[];
  continueLearning: { type: "note" | "snippet" | "dsa" | "lld" | "resource"; id: string; title: string; workspaceId: string | null; updatedAt: string }[];
  totalCompletedActivities: number;
  workspaces: WorkspaceSummary[];
}

export type ActivityLinkType = "note" | "dsa" | "lld" | "snippet" | "resource" | "book";
export interface ActivityLink {
  type: ActivityLinkType;
  id: string;
  title: string;
  url?: string;
}
export type ActivityWithLink = Activity & { link: ActivityLink | null };
