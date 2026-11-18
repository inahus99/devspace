import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { db, schema } from "./db/index.ts";
import { env } from "./env.ts";

export interface StoredObject {
  stream: Readable;
  size?: number;
}

export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Returns null when the object does not exist. */
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

const KEY_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}(\.[a-z0-9]{1,10})?$/;
function assertKey(key: string) {
  if (!KEY_RE.test(key)) throw new Error(`Invalid storage key: ${key}`);
}

class DiskStorage implements StorageDriver {
  readonly name = "disk";
  private readonly root: string;
  constructor(dir: string) {
    this.root = path.resolve(dir);
  }
  private file(key: string) {
    assertKey(key);
    return path.join(this.root, ...key.split("/"));
  }
  async put(key: string, body: Buffer) {
    const file = this.file(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, file);
  }
  async get(key: string) {
    const file = this.file(key);
    try {
      const stat = await fs.stat(file);
      return { stream: createReadStream(file), size: stat.size };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
  async delete(key: string) {
    await fs.rm(this.file(key), { force: true });
  }
}

class S3Storage implements StorageDriver {
  readonly name = "s3";
  private readonly client: S3Client;
  constructor(private readonly bucket: string) {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    assertKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    assertKey(key);
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!out.Body) return null;
      return { stream: out.Body as Readable, size: out.ContentLength };
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === "NoSuchKey" || name === "NotFound") return null;
      throw err;
    }
  }
  async delete(key: string) {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function createStorage(): StorageDriver {
  if (env.STORAGE_DRIVER === "s3") {
    if (!env.S3_BUCKET) throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET");
    return new S3Storage(env.S3_BUCKET);
  }
  return new DiskStorage(env.UPLOAD_DIR);
}

export const storage = createStorage();

let draining = false;
/** Delete storage objects queued by the attachments delete trigger. */
export async function drainStorageDeletions(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const batch = await db.select().from(schema.storageDeletions).limit(100);
      if (batch.length === 0) break;
      for (const row of batch) {
        try {
          await storage.delete(row.storageKey);
        } catch (err) {
          console.error(`[storage] could not delete ${row.storageKey}`, err);
        }
        await db.delete(schema.storageDeletions).where(eq(schema.storageDeletions.storageKey, row.storageKey));
      }
      if (batch.length < 100) break;
    }
  } finally {
    draining = false;
  }
}

export function scheduleDrain() {
  setImmediate(() => {
    drainStorageDeletions().catch((err) => console.error("[storage] drain failed", err));
  });
}

