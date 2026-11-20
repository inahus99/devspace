import type { BinaryFileData, BinaryFiles, DataURL, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { Attachment, Diagram } from "@shared/types";
import { api } from "@/lib/api";
import { uploadFile } from "@/lib/queries";

/**
 * Images on a drawing live in file storage. The saved scene keeps only this reference,
 * so a notebook full of screenshots stays quick to open and save. Older drawings with the
 * image data inline are moved over the next time they save.
 */
export type StoredFile = { id: string; mimeType: string; created: number; attachmentId: string };

type RawFile = { id?: string; mimeType?: string; created?: number; dataURL?: string; attachmentId?: string };

export function storedFilesOf(files: Record<string, unknown> | undefined): Map<string, StoredFile> {
  const out = new Map<string, StoredFile>();
  for (const [key, raw] of Object.entries(files ?? {})) {
    const f = raw as RawFile;
    if (f.attachmentId && !f.dataURL) out.set(key, { id: f.id ?? key, mimeType: f.mimeType ?? "image/png", created: f.created ?? Date.now(), attachmentId: f.attachmentId });
  }
  return out;
}

/** Files still saved inline (older drawings), which Excalidraw can load straight away. */
export function inlineFilesOf(files: Record<string, unknown> | undefined): BinaryFiles {
  const out: BinaryFiles = {};
  for (const [key, raw] of Object.entries(files ?? {})) if ((raw as RawFile).dataURL) out[key] = raw as BinaryFileData;
  return out;
}

function blobToDataURL(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Fetches stored images and hands them to Excalidraw, a few at a time, as they arrive. */
export async function loadStoredFiles(draw: ExcalidrawImperativeAPI, files: StoredFile[]) {
  const queue = [...files];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try {
        const res = await fetch(`/api/files/${f.attachmentId}`, { credentials: "same-origin" });
        if (!res.ok) continue;
        const dataURL = (await blobToDataURL(await res.blob())) as DataURL;
        draw.addFiles([{ id: f.id as BinaryFileData["id"], mimeType: f.mimeType as BinaryFileData["mimeType"], created: f.created, dataURL }]);
      } catch {
        /* the image shows as missing; the rest still load */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };

/** Uploads an inline image of the drawing and returns the reference to save instead. */
export async function storeFile(diagram: Pick<Diagram, "id" | "workspaceId" | "folderId">, file: BinaryFileData): Promise<StoredFile> {
  const blob = await (await fetch(file.dataURL)).blob();
  const mimeType = blob.type || file.mimeType;
  const name = `drawing-image.${EXT[mimeType] ?? "png"}`;
  const att = await uploadFile(new File([blob], name, { type: mimeType }), {
    workspaceId: diagram.workspaceId,
    folderId: diagram.folderId,
    diagramId: diagram.id,
  });
  return { id: file.id, mimeType, created: file.created, attachmentId: att.id };
}

/**
 * Deletes stored images that are no longer on the drawing (removed in an earlier session).
 * Runs when the editor opens, against the latest saved scene, so undo history can't bring
 * a deleted image back afterwards. Files uploaded since opening are left alone.
 */
export async function pruneStoredFiles(diagramId: string, keep: Iterable<string>, openedAt: number) {
  const [latest, list] = await Promise.all([api.get<Diagram>(`/diagrams/${diagramId}`), api.get<Attachment[]>("/attachments", { diagramId })]);
  const used = new Set(keep);
  for (const f of storedFilesOf(latest.scene.files as Record<string, unknown>).values()) used.add(f.attachmentId);
  for (const a of list) {
    if (!used.has(a.id) && Date.parse(a.createdAt) < openedAt - 60_000) await api.delete(`/attachments/${a.id}`).catch(() => {});
  }
}
