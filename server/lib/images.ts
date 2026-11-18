import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { scheduleDrain } from "../storage.ts";

/** Attachments uploaded as workspace/folder banners carry this label (hidden from file lists). */
export const BANNER_LABEL = "banner";

const FILE_URL = /^\/api\/files\/([0-9a-f-]{36})$/;

/** "" clears an image reference (stored as NULL). */
export function normalizeImageRef<T extends string | null | undefined>(v: T): T | null {
  return (v === "" ? null : v) as T | null;
}

/**
 * When an uploaded image (cover/banner) is replaced or cleared, delete its attachment row;
 * the storage-deletion trigger queues the file and the drain removes it.
 */
export async function releaseReplacedImage(userId: string, oldUrl: unknown, newUrl: unknown) {
  if (typeof oldUrl !== "string" || oldUrl === newUrl) return;
  const m = oldUrl.match(FILE_URL);
  if (!m) return;
  await db
    .delete(schema.attachments)
    .where(and(eq(schema.attachments.id, m[1]!), eq(schema.attachments.userId, userId)));
  scheduleDrain();
}
