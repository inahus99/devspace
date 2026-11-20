import { z } from "zod";
import {
  BOOK_STATUSES,
  DSA_DIFFICULTIES,
  DSA_STATUSES,
  LANGUAGE_IDS,
  LLD_STATUSES,
  NOTE_FORMATS,
  RESOURCE_STATUSES,
  RESOURCE_TYPES,
  SOLID_PRINCIPLES,
  WORKSPACE_KINDS,
} from "./constants.ts";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const zId = z.uuid();
export const zOptId = z.uuid().nullable().optional();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Expected HH:MM");
const text = (max = 20_000) => z.string().max(max);
const longText = text(500_000);
const zTags = z.array(z.string().trim().min(1).max(40)).max(30).optional();
const zHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a hex colour");

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
const zUrl = z.string().trim().max(2048).refine(isHttpUrl, "Enter a valid http(s) URL");
const zOptUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || isHttpUrl(v), "Enter a valid http(s) URL");

// ---------------------------------------------------------------------------
// Auth & profile
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.email("Enter a valid email").max(200),
  password: z.string().min(1, "Password is required").max(200),
});
export const registerSchema = z.object({
  email: z.email("Enter a valid email").max(200),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  displayName: z.string().trim().max(80).optional(),
});
export const profileUpdateSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  settings: z
    .object({
      theme: z.enum(["light", "dark", "system"]).optional(),
      weekStartsOn: z.union([z.literal(0), z.literal(1)]).optional(),
      dailyGoalMinutes: z.number().int().min(0).max(24 * 60).optional(),
    })
    .optional(),
});
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Use at least 8 characters").max(200),
});

// ---------------------------------------------------------------------------
// Workspaces & folders
// ---------------------------------------------------------------------------

/** A banner/cover image: an uploaded file served by the API, or an external http(s) URL. null clears it. */
export const zImageRef = z.union([zOptUrl, z.string().regex(/^\/api\/files\/[0-9a-f-]{36}$/)]);
const zBanner = {
  bannerUrl: zImageRef.nullable().optional(),
  bannerPosition: z.number().int().min(0).max(100).optional(),
};

export const workspaceCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  description: text(500).optional(),
  icon: z.string().max(40).optional(),
  color: zHex.optional(),
  kind: z.enum(WORKSPACE_KINDS).optional(),
  ...zBanner,
});
export const workspaceUpdateSchema = workspaceCreateSchema.partial().extend({
  archived: z.boolean().optional(),
});
export const reorderSchema = z.object({ ids: z.array(zId).min(1).max(1000) });

export const folderCreateSchema = z.object({
  workspaceId: zId,
  parentId: zOptId,
  name: z.string().trim().min(1, "Name is required").max(120),
});
export const folderUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  /** Move: new parent (null = workspace root). */
  parentId: zOptId,
  /** Optional index among the new siblings (default: end). */
  position: z.number().int().min(0).optional(),
  ...zBanner,
});

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export const noteCreateSchema = z.object({
  workspaceId: zId,
  folderId: zOptId,
  title: z.string().trim().max(300).optional(),
  format: z.enum(NOTE_FORMATS).optional(),
  contentJson: z.unknown().optional(),
  contentHtml: longText.optional(),
  contentMarkdown: longText.optional(),
  plainText: longText.optional(),
  isFavorite: z.boolean().optional(),
  tags: zTags,
});
export const noteUpdateSchema = noteCreateSchema.partial();

export const snippetCreateSchema = z.object({
  workspaceId: zId,
  folderId: zOptId,
  noteId: zOptId,
  dsaProblemId: zOptId,
  title: z.string().trim().min(1, "Title is required").max(300),
  description: text(5000).optional(),
  language: z.enum(LANGUAGE_IDS).optional(),
  code: longText.optional(),
  isFavorite: z.boolean().optional(),
  tags: zTags,
});
export const snippetUpdateSchema = snippetCreateSchema.partial();

// Excalidraw scenes are opaque editor JSON; only the outer shape is checked here.
const zDiagramScene = z.object({
  elements: z.array(z.unknown()).max(20_000),
  appState: z.record(z.string(), z.unknown()).optional(),
  files: z.record(z.string(), z.unknown()).optional(),
});
export const diagramCreateSchema = z.object({
  workspaceId: zId,
  folderId: zOptId,
  bookId: zOptId,
  kind: z.enum(["drawing", "board"]).optional(),
  title: z.string().trim().min(1, "Title is required").max(300),
  scene: zDiagramScene.optional(),
  preview: z
    .string()
    .max(1_500_000)
    .regex(/^(data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+)?$/, "Preview must be an image data URL")
    .optional(),
  isFavorite: z.boolean().optional(),
});
export const diagramUpdateSchema = diagramCreateSchema.partial();

export const resourceCreateSchema = z.object({
  workspaceId: zOptId,
  folderId: zOptId,
  title: z.string().trim().min(1, "Title is required").max(300),
  url: zUrl,
  description: text(5000).optional(),
  type: z.enum(RESOURCE_TYPES).optional(),
  status: z.enum(RESOURCE_STATUSES).optional(),
  isFavorite: z.boolean().optional(),
  tags: zTags,
});
export const resourceUpdateSchema = resourceCreateSchema.partial();

export const dsaProblemCreateSchema = z.object({
  workspaceId: zId,
  folderId: zOptId,
  title: z.string().trim().min(1, "Title is required").max(300),
  platform: text(60).optional(),
  url: zOptUrl.optional(),
  topic: text(80).optional(),
  difficulty: z.enum(DSA_DIFFICULTIES).optional(),
  status: z.enum(DSA_STATUSES).optional(),
  attemptedOn: zDate.nullable().optional(),
  solvedOn: zDate.nullable().optional(),
  approach: longText.optional(),
  timeComplexity: text(100).optional(),
  spaceComplexity: text(100).optional(),
  pseudocode: longText.optional(),
  notes: longText.optional(),
  isFavorite: z.boolean().optional(),
  nextReviewOn: zDate.nullable().optional(),
  tags: zTags,
});
export const dsaProblemUpdateSchema = dsaProblemCreateSchema.partial();
export const dsaReviewSchema = z.object({
  /** Local date of the review. */
  date: zDate,
  /** true = recalled well (interval grows), false = struggled (needs revision). */
  success: z.boolean(),
});

export const dsaSolutionCreateSchema = z.object({
  problemId: zId,
  title: z.string().trim().max(200).optional(),
  language: z.enum(LANGUAGE_IDS).optional(),
  code: longText.optional(),
  timeComplexity: text(100).optional(),
  spaceComplexity: text(100).optional(),
  notes: longText.optional(),
});
export const dsaSolutionUpdateSchema = dsaSolutionCreateSchema.omit({ problemId: true }).partial();

const SOLID_IDS = SOLID_PRINCIPLES.map((p) => p.id) as unknown as ["S", "O", "L", "I", "D"];
export const lldCreateSchema = z.object({
  workspaceId: zId,
  folderId: zOptId,
  title: z.string().trim().min(1, "Title is required").max(300),
  status: z.enum(LLD_STATUSES).optional(),
  difficulty: z.enum(DSA_DIFFICULTIES).nullable().optional(),
  problemStatement: longText.optional(),
  functionalRequirements: longText.optional(),
  nonFunctionalRequirements: longText.optional(),
  entities: longText.optional(),
  diagramSource: longText.optional(),
  designPatterns: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  solidPrinciples: z.array(z.enum(SOLID_IDS)).max(5).optional(),
  implementationLanguage: z.enum(LANGUAGE_IDS).optional(),
  implementationCode: longText.optional(),
  tradeOffs: longText.optional(),
  interviewNotes: longText.optional(),
  isFavorite: z.boolean().optional(),
  tags: zTags,
});
export const lldUpdateSchema = lldCreateSchema.partial();

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

export const bookCreateSchema = z.object({
  workspaceId: zOptId,
  title: z.string().trim().min(1, "Title is required").max(300),
  author: text(200).optional(),
  coverUrl: zOptUrl.or(z.string().regex(/^\/api\/files\/[0-9a-f-]+$/)).optional(),
  description: text(10_000).optional(),
  totalPages: z.number().int().min(0).max(100_000).optional(),
  currentPage: z.number().int().min(0).max(100_000).optional(),
  status: z.enum(BOOK_STATUSES).optional(),
  startedOn: zDate.nullable().optional(),
  completedOn: zDate.nullable().optional(),
  notes: longText.optional(),
  tags: zTags,
});
export const bookUpdateSchema = bookCreateSchema.partial();
export const bookProgressSchema = z.object({
  currentPage: z.number().int().min(0).max(100_000),
  /** Local date of the reading session. */
  date: zDate,
});
export const highlightCreateSchema = z.object({
  content: z.string().trim().min(1, "Highlight text is required").max(10_000),
  page: z.number().int().min(0).max(100_000).nullable().optional(),
  note: text(10_000).optional(),
});
export const highlightUpdateSchema = highlightCreateSchema.partial();

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const activityCreateSchema = z.object({
  workspaceId: zOptId,
  title: z.string().trim().min(1, "Title is required").max(300),
  description: text(5000).optional(),
  date: zDate,
  startTime: zTime.nullable().optional(),
  endTime: zTime.nullable().optional(),
  plannedMinutes: z.number().int().min(0).max(24 * 60).optional(),
  actualMinutes: z.number().int().min(0).max(24 * 60).optional(),
  completed: z.boolean().optional(),
  notes: text(20_000).optional(),
  noteId: zOptId,
  snippetId: zOptId,
  dsaProblemId: zOptId,
  lldExerciseId: zOptId,
  resourceId: zOptId,
  bookId: zOptId,
});
export const activityUpdateSchema = activityCreateSchema.partial();

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export const attachmentTargetSchema = z.object({
  workspaceId: zOptId,
  folderId: zOptId,
  noteId: zOptId,
  dsaProblemId: zOptId,
  lldExerciseId: zOptId,
  bookId: zOptId,
  label: text(200).optional(),
});
export const attachmentUpdateSchema = z.object({
  label: text(200).optional(),
  folderId: zOptId,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type WorkspaceInput = z.infer<typeof workspaceCreateSchema>;
export type NoteInput = z.infer<typeof noteCreateSchema>;
export type SnippetInput = z.infer<typeof snippetCreateSchema>;
export type DiagramInput = z.infer<typeof diagramCreateSchema>;
export type ResourceInput = z.infer<typeof resourceCreateSchema>;
export type DsaProblemInput = z.infer<typeof dsaProblemCreateSchema>;
export type DsaSolutionInput = z.infer<typeof dsaSolutionCreateSchema>;
export type LldInput = z.infer<typeof lldCreateSchema>;
export type BookInput = z.infer<typeof bookCreateSchema>;
export type ActivityInput = z.infer<typeof activityCreateSchema>;
