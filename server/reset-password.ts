/**
 * Operator command: reset an account's password from a shell that can reach the database.
 *
 *   npm run reset-password -- <email>              prompt for the new password (hidden)
 *   npm run reset-password -- <email> --generate   set a random password and print it once
 *   npm run reset-password -- --list               list account emails
 *
 * Every session of that account is revoked, so all devices must sign in again.
 * On Railway: `railway ssh` into the DevSpace service, then run the command there.
 */
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import bcrypt from "bcryptjs";
import { asc, eq, sql } from "drizzle-orm";
import { registerSchema } from "../shared/schemas.ts";
import { db, pool, schema } from "./db/index.ts";

const { users, sessions } = schema;
const passwordRule = registerSchema.shape.password;

function usage(code = 1): never {
  console.log(`Usage:
  npm run reset-password -- <email>              prompt for a new password
  npm run reset-password -- <email> --generate   generate one and print it once
  npm run reset-password -- --list               list accounts`);
  process.exit(code);
}

/** Read a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function choosePassword(generate: boolean): Promise<{ password: string; generated: boolean }> {
  if (generate || !process.stdin.isTTY) {
    if (!generate) console.log("No interactive terminal — generating a password instead.");
    return { password: randomBytes(18).toString("base64url"), generated: true };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const first = await promptHidden("New password: ");
    const check = passwordRule.safeParse(first);
    if (!check.success) {
      console.log(`  ${check.error.issues[0]?.message ?? "Invalid password"}`);
      continue;
    }
    const second = await promptHidden("Repeat password: ");
    if (first !== second) {
      console.log("  Passwords don't match.");
      continue;
    }
    return { password: first, generated: false };
  }
  throw new Error("No valid password entered");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) usage(0);

  if (args.includes("--list")) {
    const rows = await db
      .select({ email: users.email, name: users.displayName, createdAt: users.createdAt })
      .from(users)
      .orderBy(asc(users.createdAt));
    if (rows.length === 0) console.log("No accounts yet.");
    for (const r of rows) console.log(`${r.email}\t${r.name}\tcreated ${r.createdAt.toISOString().slice(0, 10)}`);
    return;
  }

  const email = args.find((a) => !a.startsWith("--"));
  if (!email) usage();

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.trim().toLowerCase()))
    .limit(1);
  if (!user) {
    console.error(`No account with email ${email}. Use --list to see accounts.`);
    process.exitCode = 1;
    return;
  }

  const { password, generated } = await choosePassword(args.includes("--generate"));
  const passwordHash = await bcrypt.hash(password, 12);
  const revoked = await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
    return tx.delete(sessions).where(eq(sessions.userId, user.id)).returning({ id: sessions.id });
  });

  console.log(`Password reset for ${user.email}. Signed out ${revoked.length} session(s).`);
  if (generated) {
    console.log(`\n  New password: ${password}\n`);
    console.log("It is shown only once — sign in and change it in Settings → Password.");
  }
}

main()
  .catch((err) => {
    console.error("[reset-password] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
