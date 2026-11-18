import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../env.ts";
import * as schema from "./schema.ts";

// Return DATE columns as plain 'YYYY-MM-DD' strings (no timezone shifting).
pg.types.setTypeParser(1082, (v: string) => v);

function sslConfig() {
  const url = env.DATABASE_URL;
  // Railway's private network (*.railway.internal) and localhost don't use TLS.
  if (/localhost|127\.0\.0\.1|\.railway\.internal/.test(url)) return undefined;
  if (env.PGSSLMODE === "disable" || url.includes("sslmode=disable")) return undefined;
  return { rejectUnauthorized: false };
}

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: sslConfig(),
  max: 10,
  idleTimeoutMillis: 30_000,
});

export const db = drizzle(pool, { schema, casing: undefined });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
