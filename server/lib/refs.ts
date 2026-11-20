import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { badRequest } from "./http.ts";

const REF_TABLES = {
  workspaceId: schema.workspaces,
  parentId: schema.folders,
  noteId: schema.notes,
  snippetId: schema.codeSnippets,
  dsaProblemId: schema.dsaProblems,
  problemId: schema.dsaProblems,
  lldExerciseId: schema.lldExercises,
  resourceId: schema.resources,
  bookId: schema.books,
  diagramId: schema.diagrams,
} as const;

const LABELS: Record<string, string> = {
  workspaceId: "Workspace",
  parentId: "Parent folder",
  noteId: "Note",
  snippetId: "Snippet",
  dsaProblemId: "DSA problem",
  problemId: "DSA problem",
  lldExerciseId: "LLD exercise",
  resourceId: "Resource",
  bookId: "Book",
  diagramId: "Drawing",
};

/**
 * Ensure every foreign reference in `input` points at a row owned by `userId`,
 * and that a folder belongs to the item's workspace. Together with scoping every
 * read/update/delete by user_id, this is the multi-user isolation guarantee.
 */
export async function verifyRefs(
  userId: string,
  input: Record<string, unknown>,
  context: { workspaceId?: string | null } = {},
): Promise<void> {
  for (const [key, table] of Object.entries(REF_TABLES)) {
    const value = input[key];
    if (typeof value !== "string") continue;
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, value), eq(table.userId, userId)))
      .limit(1);
    if (!row) throw badRequest(`${LABELS[key]} not found`);
  }
  if (typeof input.folderId === "string") {
    const [folder] = await db
      .select({ workspaceId: schema.folders.workspaceId })
      .from(schema.folders)
      .where(and(eq(schema.folders.id, input.folderId), eq(schema.folders.userId, userId)))
      .limit(1);
    if (!folder) throw badRequest("Folder not found");
    const ws = input.workspaceId !== undefined ? input.workspaceId : context.workspaceId;
    if (ws !== folder.workspaceId) throw badRequest("Folder belongs to a different workspace");
  }
}
