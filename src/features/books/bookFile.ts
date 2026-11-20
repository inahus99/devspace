import type { Attachment, Book } from "@shared/types";
import { api } from "@/lib/api";
import { uploadFile } from "@/lib/queries";

/** Label of the attachment that holds a book's own PDF (one per book; uploading again replaces it). */
export const BOOK_FILE_LABEL = "book-file";

export const isPdfFile = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

/** Uploads a book's PDF, then removes the ones it replaces. */
export async function uploadBookPdf(book: Pick<Book, "id" | "workspaceId">, file: File, replaces: Attachment[] = []) {
  const att = await uploadFile(file, { bookId: book.id, workspaceId: book.workspaceId, label: BOOK_FILE_LABEL });
  for (const old of replaces) await api.delete(`/attachments/${old.id}`).catch(() => {});
  return att;
}
