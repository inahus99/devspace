import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
// Works from both server/ (tsx) and dist-server/ (bundled build).
const migrationsFolder = path.resolve(here, "..", "drizzle");

async function main() {
  console.log(`[migrate] applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("[migrate] database is up to date");
  await pool.end();
}

main().catch(async (err) => {
  console.error("[migrate] failed", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
