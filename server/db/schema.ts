import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ATTACHMENT_KINDS,
  BOOK_STATUSES,
  DSA_DIFFICULTIES,
  DSA_STATUSES,
  LLD_STATUSES,
  NOTE_FORMATS,
  RESOURCE_STATUSES,
  RESOURCE_TYPES,
  WORKSPACE_KINDS,
} from "../../shared/constants.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());
const ownerId = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const workspaceKind = pgEnum("workspace_kind", WORKSPACE_KINDS);
export const noteFormat = pgEnum("note_format", NOTE_FORMATS);
export const resourceType = pgEnum("resource_type", RESOURCE_TYPES);
export const resourceStatus = pgEnum("resource_status", RESOURCE_STATUSES);
export const dsaDifficulty = pgEnum("dsa_difficulty", DSA_DIFFICULTIES);
export const dsaStatus = pgEnum("dsa_status", DSA_STATUSES);
export const lldStatus = pgEnum("lld_status", LLD_STATUSES);
export const bookStatus = pgEnum("book_status", BOOK_STATUSES);
export const attachmentKind = pgEnum("attachment_kind", ATTACHMENT_KINDS);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export type UserSettings = {
  theme?: "light" | "dark" | "system";
  weekStartsOn?: 0 | 1;
  dailyGoalMinutes?: number;
  /** When the account last downloaded a full backup (ISO timestamp); set by the server. */
  lastBackupAt?: string;
};

/** "profiles" in the product spec. One row per account. */
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull().default(""),
  settings: jsonb("settings").$type<UserSettings>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the opaque cookie token — the raw token is never stored. */
    id: text("id").primaryKey(),
    userId: ownerId(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

// ---------------------------------------------------------------------------
// Workspaces & folders
// ---------------------------------------------------------------------------

export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    userId: ownerId(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    icon: text("icon").notNull().default("folder"),
    color: text("color").notNull().default("#2b7a74"),
    kind: workspaceKind("kind").notNull().default("general"),
    /** Header banner: an uploaded file (/api/files/:id) or an external https URL. */
    bannerUrl: text("banner_url"),
    /** Vertical focal point of the banner image, 0 (top) – 100 (bottom). */
    bannerPosition: integer("banner_position").notNull().default(50),
    position: integer("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("workspaces_user_position_idx").on(t.userId, t.position)],
);

export const folders = pgTable(
  "folders",
  {
    id: id(),
    userId: ownerId(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => folders.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    bannerUrl: text("banner_url"),
    bannerPosition: integer("banner_position").notNull().default(50),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("folders_workspace_parent_idx").on(t.workspaceId, t.parentId, t.position),
    index("folders_user_idx").on(t.userId),
    check("folders_not_own_parent", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
  ],
);

// ---------------------------------------------------------------------------
// Knowledge content
// ---------------------------------------------------------------------------

export const notes = pgTable(
  "notes",
  {
    id: id(),
    userId: ownerId(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    title: text("title").notNull().default("Untitled"),
    format: noteFormat("format").notNull().default("rich"),
    /** TipTap document (rich notes). */
    contentJson: jsonb("content_json"),
    /** Rendered HTML of the rich document — used for Markdown export. */
    contentHtml: text("content_html").notNull().default(""),
    /** Source for markdown notes. */
    contentMarkdown: text("content_markdown").notNull().default(""),
    /** Plain text for search & previews. */
    plainText: text("plain_text").notNull().default(""),
    isFavorite: boolean("is_favorite").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("notes_user_updated_idx").on(t.userId, t.updatedAt),
    index("notes_workspace_folder_idx").on(t.workspaceId, t.folderId),
  ],
);

export const dsaProblems = pgTable(
  "dsa_problems",
  {
    id: id(),
    userId: ownerId(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    platform: text("platform").notNull().default(""),
    url: text("url").notNull().default(""),
    topic: text("topic").notNull().default(""),
    difficulty: dsaDifficulty("difficulty").notNull().default("medium"),
    status: dsaStatus("status").notNull().default("todo"),
    attemptedOn: date("attempted_on"),
    solvedOn: date("solved_on"),
    approach: text("approach").notNull().default(""),
    timeComplexity: text("time_complexity").notNull().default(""),
    spaceComplexity: text("space_complexity").notNull().default(""),
    pseudocode: text("pseudocode").notNull().default(""),
    notes: text("notes").notNull().default(""),
    isFavorite: boolean("is_favorite").notNull().default(false),
    reviewCount: integer("review_count").notNull().default(0),
    lastReviewedOn: date("last_reviewed_on"),
    nextReviewOn: date("next_review_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("dsa_problems_user_status_idx").on(t.userId, t.status),
    index("dsa_problems_workspace_idx").on(t.workspaceId),
    index("dsa_problems_next_review_idx").on(t.userId, t.nextReviewOn),
  ],
);

export const dsaSolutions = pgTable(
  "dsa_solutions",
  {
    id: id(),
    userId: ownerId(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => dsaProblems.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Solution"),
    language: text("language").notNull().default("cpp"),
    code: text("code").notNull().default(""),
    timeComplexity: text("time_complexity").notNull().default(""),
    spaceComplexity: text("space_complexity").notNull().default(""),
    notes: text("notes").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("dsa_solutions_problem_idx").on(t.problemId, t.position)],
);

export const codeSnippets = pgTable(
  "code_snippets",
  {
    id: id(),
    userId: ownerId(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "set null" }),
    dsaProblemId: uuid("dsa_problem_id").references(() => dsaProblems.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    language: text("language").notNull().default("typescript"),
    code: text("code").notNull().default(""),
    isFavorite: boolean("is_favorite").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("code_snippets_user_updated_idx").on(t.userId, t.updatedAt),
    index("code_snippets_workspace_folder_idx").on(t.workspaceId, t.folderId),
  ],
);

export const lldExercises = pgTable(
  "lld_exercises",
  {
    id: id(),
    userId: ownerId(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: lldStatus("status").notNull().default("todo"),
    difficulty: dsaDifficulty("difficulty"),
    problemStatement: text("problem_statement").notNull().default(""),
    functionalRequirements: text("functional_requirements").notNull().default(""),
    nonFunctionalRequirements: text("non_functional_requirements").notNull().default(""),
    entities: text("entities").notNull().default(""),
    /** Optional textual UML (Mermaid / PlantUML) kept alongside diagram screenshots. */
    diagramSource: text("diagram_source").notNull().default(""),
    designPatterns: text("design_patterns").array().notNull().default(sql`'{}'::text[]`),
    solidPrinciples: text("solid_principles").array().notNull().default(sql`'{}'::text[]`),
    implementationLanguage: text("implementation_language").notNull().default("java"),
    implementationCode: text("implementation_code").notNull().default(""),
    tradeOffs: text("trade_offs").notNull().default(""),
    interviewNotes: text("interview_notes").notNull().default(""),
    isFavorite: boolean("is_favorite").notNull().default(false),
    completedOn: date("completed_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("lld_exercises_user_idx").on(t.userId, t.updatedAt),
    index("lld_exercises_workspace_folder_idx").on(t.workspaceId, t.folderId),
  ],
);

/** An Excalidraw drawing. `scene` is the editor's own JSON (elements, appState subset, embedded files). */
export interface DiagramScene {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

export const diagrams = pgTable(
  "diagrams",
  {
    id: id(),
    userId: ownerId(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    /** Set for a notebook kept alongside a book (opened next to the PDF reader). */
    bookId: uuid("book_id").references(() => books.id, { onDelete: "set null" }),
    /** "board": a folder's notebook in the Notebooks app (at most one per folder). */
    kind: text("kind", { enum: ["drawing", "board"] }).notNull().default("drawing"),
    title: text("title").notNull(),
    scene: jsonb("scene").$type<DiagramScene>().notNull().default({ elements: [] }),
    /** Small WebP data URL rendered from the scene, for cards and lists. */
    preview: text("preview").notNull().default(""),
    isFavorite: boolean("is_favorite").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("diagrams_user_updated_idx").on(t.userId, t.updatedAt),
    index("diagrams_book_idx").on(t.bookId),
    uniqueIndex("diagrams_board_folder_idx").on(t.folderId).where(sql`${t.kind} = 'board'`),
    check("diagrams_kind_valid", sql`${t.kind} in ('drawing', 'board')`),
    index("diagrams_workspace_folder_idx").on(t.workspaceId, t.folderId),
  ],
);

export const resources = pgTable(
  "resources",
  {
    id: id(),
    userId: ownerId(),
    /** Optional: resources can live in the central library without a workspace. */
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    description: text("description").notNull().default(""),
    type: resourceType("type").notNull().default("other"),
    status: resourceStatus("status").notNull().default("unread"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // Link preview read from the page's own tags (og:image, title, description, icon).
    previewImage: text("preview_image"),
    previewTitle: text("preview_title"),
    previewDescription: text("preview_description"),
    siteName: text("site_name"),
    faviconUrl: text("favicon_url"),
    /** When the preview was last looked up; null means not yet (the client asks for it). */
    previewFetchedAt: timestamp("preview_fetched_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("resources_user_created_idx").on(t.userId, t.createdAt),
    index("resources_workspace_folder_idx").on(t.workspaceId, t.folderId),
  ],
);

// ---------------------------------------------------------------------------
// Workspace memos: short notes on how a topic is going, shown on the dashboard.
// ---------------------------------------------------------------------------

export const memos = pgTable(
  "memos",
  {
    id: id(),
    userId: ownerId(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("memos_workspace_created_idx").on(t.workspaceId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

export const books = pgTable(
  "books",
  {
    id: id(),
    userId: ownerId(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    author: text("author").notNull().default(""),
    coverUrl: text("cover_url").notNull().default(""),
    description: text("description").notNull().default(""),
    totalPages: integer("total_pages").notNull().default(0),
    currentPage: integer("current_page").notNull().default(0),
    status: bookStatus("status").notNull().default("want_to_read"),
    startedOn: date("started_on"),
    completedOn: date("completed_on"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("books_user_status_idx").on(t.userId, t.status),
    check("books_pages_valid", sql`${t.totalPages} >= 0 AND ${t.currentPage} >= 0`),
  ],
);

export const bookHighlights = pgTable(
  "book_highlights",
  {
    id: id(),
    userId: ownerId(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    page: integer("page"),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("book_highlights_book_idx").on(t.bookId)],
);

/** Reading history: one row per progress update. */
export const readingLogs = pgTable(
  "reading_logs",
  {
    id: id(),
    userId: ownerId(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    loggedOn: date("logged_on").notNull(),
    fromPage: integer("from_page").notNull(),
    toPage: integer("to_page").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("reading_logs_user_date_idx").on(t.userId, t.loggedOn), index("reading_logs_book_idx").on(t.bookId)],
);

// ---------------------------------------------------------------------------
// Attachments (files live in object storage / volume, never in the DB)
// ---------------------------------------------------------------------------

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    userId: ownerId(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
    dsaProblemId: uuid("dsa_problem_id").references(() => dsaProblems.id, { onDelete: "cascade" }),
    lldExerciseId: uuid("lld_exercise_id").references(() => lldExercises.id, { onDelete: "cascade" }),
    bookId: uuid("book_id").references(() => books.id, { onDelete: "cascade" }),
    /** Images placed on a drawing or notebook; deleted with it. */
    diagramId: uuid("diagram_id").references((): AnyPgColumn => diagrams.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    kind: attachmentKind("kind").notNull(),
    label: text("label").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("attachments_user_idx").on(t.userId, t.createdAt),
    index("attachments_workspace_idx").on(t.workspaceId),
    index("attachments_note_idx").on(t.noteId),
    index("attachments_dsa_idx").on(t.dsaProblemId),
    index("attachments_lld_idx").on(t.lldExerciseId),
    index("attachments_book_idx").on(t.bookId),
    index("attachments_diagram_idx").on(t.diagramId),
  ],
);

/**
 * Queue of storage objects whose attachment rows were deleted (directly or via
 * cascade). Filled by a trigger, drained by the server. Keeps storage in sync
 * with the database even when a workspace delete cascades through thousands of rows.
 */
export const storageDeletions = pgTable("storage_deletions", {
  storageKey: text("storage_key").primaryKey(),
  queuedAt: timestamp("queued_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Activities — the single source for planner, calendar, dashboard & analytics
// ---------------------------------------------------------------------------

export const activities = pgTable(
  "activities",
  {
    id: id(),
    userId: ownerId(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Local calendar date chosen by the user (no timezone shifting). */
    date: date("date").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    /** Planned duration in minutes. */
    plannedMinutes: integer("planned_minutes").notNull().default(0),
    /** Actual recorded study time in minutes. */
    actualMinutes: integer("actual_minutes").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
    // Explicit, nullable links to the content this activity is about.
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "set null" }),
    snippetId: uuid("snippet_id").references(() => codeSnippets.id, { onDelete: "set null" }),
    dsaProblemId: uuid("dsa_problem_id").references(() => dsaProblems.id, { onDelete: "set null" }),
    lldExerciseId: uuid("lld_exercise_id").references(() => lldExercises.id, { onDelete: "set null" }),
    resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "set null" }),
    bookId: uuid("book_id").references(() => books.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("activities_user_date_idx").on(t.userId, t.date),
    index("activities_workspace_date_idx").on(t.workspaceId, t.date),
    check("activities_minutes_valid", sql`${t.plannedMinutes} >= 0 AND ${t.actualMinutes} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const tags = pgTable(
  "tags",
  {
    id: id(),
    userId: ownerId(),
    /** Stored normalised (trimmed, lower-case). */
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_user_name_idx").on(t.userId, t.name)],
);

/** Tag assignment with explicit foreign keys; exactly one target per row. */
export const contentTags = pgTable(
  "content_tags",
  {
    id: id(),
    userId: ownerId(),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
    snippetId: uuid("snippet_id").references(() => codeSnippets.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "cascade" }),
    dsaProblemId: uuid("dsa_problem_id").references(() => dsaProblems.id, { onDelete: "cascade" }),
    lldExerciseId: uuid("lld_exercise_id").references(() => lldExercises.id, { onDelete: "cascade" }),
    bookId: uuid("book_id").references(() => books.id, { onDelete: "cascade" }),
  },
  (t) => [
    check(
      "content_tags_one_target",
      sql`num_nonnulls(${t.noteId}, ${t.snippetId}, ${t.resourceId}, ${t.dsaProblemId}, ${t.lldExerciseId}, ${t.bookId}) = 1`,
    ),
    uniqueIndex("content_tags_note_uq").on(t.tagId, t.noteId),
    uniqueIndex("content_tags_snippet_uq").on(t.tagId, t.snippetId),
    uniqueIndex("content_tags_resource_uq").on(t.tagId, t.resourceId),
    uniqueIndex("content_tags_dsa_uq").on(t.tagId, t.dsaProblemId),
    uniqueIndex("content_tags_lld_uq").on(t.tagId, t.lldExerciseId),
    uniqueIndex("content_tags_book_uq").on(t.tagId, t.bookId),
    index("content_tags_note_idx").on(t.noteId),
    index("content_tags_snippet_idx").on(t.snippetId),
    index("content_tags_resource_idx").on(t.resourceId),
    index("content_tags_dsa_idx").on(t.dsaProblemId),
    index("content_tags_lld_idx").on(t.lldExerciseId),
    index("content_tags_book_idx").on(t.bookId),
  ],
);

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type CodeSnippet = typeof codeSnippets.$inferSelect;
export type Diagram = typeof diagrams.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type Memo = typeof memos.$inferSelect;
export type DsaProblem = typeof dsaProblems.$inferSelect;
export type DsaSolution = typeof dsaSolutions.$inferSelect;
export type LldExercise = typeof lldExercises.$inferSelect;
export type Book = typeof books.$inferSelect;
export type BookHighlight = typeof bookHighlights.$inferSelect;
export type ReadingLog = typeof readingLogs.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Tag = typeof tags.$inferSelect;
