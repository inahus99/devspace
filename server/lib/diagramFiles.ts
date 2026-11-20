import { storage } from "../storage.ts";

/**
 * Images on a drawing are stored as attachments; the saved scene only keeps a reference
 * ({ id, mimeType, attachmentId }) so big notebooks stay fast to load and save.
 * Exported .excalidraw files need the image data inline to open elsewhere (excalidraw.com).
 */
type SceneFile = { id?: string; mimeType?: string; dataURL?: string; attachmentId?: string; created?: number };

async function readAll(storageKey: string): Promise<Buffer | null> {
  const obj = await storage.get(storageKey);
  if (!obj) return null;
  const chunks: Buffer[] = [];
  for await (const c of obj.stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}

/** Returns the scene's files with stored images turned back into data URLs. */
export async function inlineSceneFiles(
  files: Record<string, unknown> | undefined,
  attachments: ReadonlyMap<string, { storageKey: string; mimeType: string }>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(files ?? {})) {
    const f = raw as SceneFile;
    const a = f.attachmentId ? attachments.get(f.attachmentId) : undefined;
    if (f.dataURL || !a) {
      if (f.dataURL) out[key] = raw;
      continue;
    }
    const buf = await readAll(a.storageKey).catch(() => null);
    if (!buf) continue;
    const { attachmentId: _drop, ...rest } = f;
    out[key] = { ...rest, mimeType: f.mimeType ?? a.mimeType, dataURL: `data:${f.mimeType ?? a.mimeType};base64,${buf.toString("base64")}` };
  }
  return out;
}
