// Domain enums shared by the database schema, API validation and the UI.

export const WORKSPACE_KINDS = ["general", "dsa", "lld"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];
export const WORKSPACE_KIND_LABELS: Record<WorkspaceKind, string> = {
  general: "General",
  dsa: "DSA tracker",
  lld: "Low-level design",
};

export const NOTE_FORMATS = ["rich", "markdown"] as const;
export type NoteFormat = (typeof NOTE_FORMATS)[number];

export const RESOURCE_TYPES = ["youtube", "twitter", "github", "docs", "article", "course", "pdf", "other"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  youtube: "YouTube",
  twitter: "X / Twitter",
  github: "GitHub",
  docs: "Documentation",
  article: "Article",
  course: "Course",
  pdf: "PDF",
  other: "Link",
};

export const RESOURCE_STATUSES = ["unread", "in_progress", "completed"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];
export const RESOURCE_STATUS_LABELS: Record<ResourceStatus, string> = {
  unread: "Unread",
  in_progress: "In progress",
  completed: "Completed",
};

export const DSA_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type DsaDifficulty = (typeof DSA_DIFFICULTIES)[number];
export const DSA_DIFFICULTY_LABELS: Record<DsaDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export const DSA_STATUSES = ["todo", "attempted", "solved", "needs_revision", "mastered"] as const;
export type DsaStatus = (typeof DSA_STATUSES)[number];
export const DSA_STATUS_LABELS: Record<DsaStatus, string> = {
  todo: "To do",
  attempted: "Attempted",
  solved: "Solved",
  needs_revision: "Needs revision",
  mastered: "Mastered",
};

export const DSA_PLATFORMS = ["LeetCode", "GeeksforGeeks", "Codeforces", "HackerRank", "CodeChef", "AtCoder", "InterviewBit", "Other"] as const;

export const DSA_TOPICS = [
  "Arrays", "Strings", "Two Pointers", "Sliding Window", "Prefix Sum", "Hashing", "Binary Search", "Sorting",
  "Linked List", "Stack", "Queue", "Heap", "Trees", "Binary Search Tree", "Graphs", "Trie", "Recursion",
  "Backtracking", "Greedy", "Dynamic Programming", "Bit Manipulation", "Math", "Intervals", "Union Find",
  "Segment Tree", "Design",
] as const;

/** Spaced-repetition intervals (days) applied after each successful review. */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30, 60] as const;

export const LLD_STATUSES = ["todo", "in_progress", "completed", "needs_revision"] as const;
export type LldStatus = (typeof LLD_STATUSES)[number];
export const LLD_STATUS_LABELS: Record<LldStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  completed: "Completed",
  needs_revision: "Needs revision",
};

export const SOLID_PRINCIPLES = [
  { id: "S", label: "Single responsibility" },
  { id: "O", label: "Open/closed" },
  { id: "L", label: "Liskov substitution" },
  { id: "I", label: "Interface segregation" },
  { id: "D", label: "Dependency inversion" },
] as const;

export const DESIGN_PATTERNS = [
  "Singleton", "Factory", "Abstract Factory", "Builder", "Prototype", "Adapter", "Bridge", "Composite",
  "Decorator", "Facade", "Flyweight", "Proxy", "Chain of Responsibility", "Command", "Iterator", "Mediator",
  "Memento", "Observer", "State", "Strategy", "Template Method", "Visitor", "Repository", "Null Object",
] as const;

export const BOOK_STATUSES = ["want_to_read", "reading", "completed", "paused", "abandoned"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];
export const BOOK_STATUS_LABELS: Record<BookStatus, string> = {
  want_to_read: "Want to read",
  reading: "Currently reading",
  completed: "Completed",
  paused: "Paused",
  abandoned: "Abandoned",
};

export const ATTACHMENT_KINDS = ["image", "pdf", "file"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const LANGUAGES = [
  { id: "cpp", label: "C++", ext: "cpp" },
  { id: "java", label: "Java", ext: "java" },
  { id: "python", label: "Python", ext: "py" },
  { id: "javascript", label: "JavaScript", ext: "js" },
  { id: "typescript", label: "TypeScript", ext: "ts" },
  { id: "go", label: "Go", ext: "go" },
  { id: "sql", label: "SQL", ext: "sql" },
  { id: "json", label: "JSON", ext: "json" },
  { id: "html", label: "HTML", ext: "html" },
  { id: "css", label: "CSS", ext: "css" },
  { id: "markdown", label: "Markdown", ext: "md" },
  { id: "shell", label: "Shell", ext: "sh" },
  { id: "plaintext", label: "Plain text", ext: "txt" },
] as const;
export type LanguageId = (typeof LANGUAGES)[number]["id"];
export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id) as [LanguageId, ...LanguageId[]];
export function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}
export function languageExt(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.ext ?? "txt";
}

/** Accent colours offered for workspaces. Values are hex so they survive export. */
export const WORKSPACE_COLORS = [
  "#1f3550", "#b4572e", "#5f7a94", "#2f7d5b", "#c98f2e", "#7a4a6b",
  "#2e6f73", "#8c3b2e", "#c7728a", "#6b5440", "#3d4b5c", "#8a9aa8",
] as const;
