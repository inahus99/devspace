import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  ALLOW_REGISTRATION: bool,
  STORAGE_DRIVER: z.enum(["disk", "s3"]).default("disk"),
  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(100),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  /** Optional one-way mirror of notes, code, links and drawings into a private GitHub repo. */
  GITHUB_SYNC_TOKEN: z.string().optional(),
  GITHUB_SYNC_REPO: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "GITHUB_SYNC_REPO must look like owner/name")
    .optional(),
  GITHUB_SYNC_BRANCH: z.string().default("main"),
  /** Minutes between automatic syncs; 0 turns automatic syncing off. */
  GITHUB_SYNC_INTERVAL_MIN: z.coerce.number().min(0).default(60),
  /** Which DevSpace account to mirror; defaults to the only account when there is one. */
  GITHUB_SYNC_USER_EMAIL: z.string().optional(),
  /** Public address of the separate Notes app (notebooks, drawings, book reader). Unset: they stay inside DevSpace. */
  NOTES_URL: z
    .string()
    .url()
    .optional()
    .transform((v) => v?.replace(/\/+$/, "")),
  /** Railway sets this automatically; used to decide whether the DB needs TLS. */
  PGSSLMODE: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
