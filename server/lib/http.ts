import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, what);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    const first = issues[0];
    throw new HttpError(400, first ? `${first.path ? `${first.path}: ` : ""}${first.message}` : "Invalid input", issues);
  }
  return result.data;
}

/** Authenticated user id (requireAuth guarantees presence). */
export function uid(req: Request): string {
  if (!req.user) throw new HttpError(401, "Not signed in");
  return req.user.id;
}

export function qs(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function qsDate(req: Request, key: string): string | undefined {
  const v = qs(req, key);
  if (v === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw badRequest(`${key} must be YYYY-MM-DD`);
  return v;
}

/** The client's local calendar date (sent on every request), falling back to UTC. */
export function localToday(req: Request): string {
  const h = req.get("x-local-date");
  if (h && /^\d{4}-\d{2}-\d{2}$/.test(h)) return h;
  return new Date().toISOString().slice(0, 10);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
export function param(req: Request, key = "id"): string {
  const v = req.params[key];
  if (!isUuid(v)) throw notFound();
  return v;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  void _next;
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    res.status(tooBig ? 413 : 400).json({ error: tooBig ? "File is too large" : err.message });
    return;
  }
  const e = err as { code?: string; type?: string; cause?: { code?: string } };
  const pgCode = e?.cause?.code ?? e?.code;
  if (pgCode === "23505") {
    res.status(409).json({ error: "That item already exists" });
    return;
  }
  if (pgCode === "23503") {
    res.status(400).json({ error: "A referenced item no longer exists" });
    return;
  }
  if (pgCode === "23514" || pgCode === "22P02") {
    res.status(400).json({ error: "The values provided are not valid" });
    return;
  }
  if (e?.type === "entity.too.large") {
    res.status(413).json({ error: "Request is too large" });
    return;
  }
  if (e?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON body" });
    return;
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: "Something went wrong on the server" });
}
