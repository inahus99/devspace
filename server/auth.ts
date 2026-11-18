import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { type NextFunction, type Request, type Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { loginSchema, passwordChangeSchema, profileUpdateSchema, registerSchema } from "../shared/schemas.ts";
import { db, schema } from "./db/index.ts";
import { env, isProd } from "./env.ts";
import { HttpError, parse, uid } from "./lib/http.ts";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  settings: schema_UserSettings;
  createdAt: Date;
}
type schema_UserSettings = typeof schema.users.$inferSelect.settings;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const COOKIE = "ds_session";
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser", 12);
const SESSION_DAYS = 30;
const DAY_MS = 86_400_000;

function hashToken(token: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex");
}

function setCookie(res: Response, token: string, expires: Date) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires,
  });
}

async function createSession(req: Request, res: Response, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await db.insert(schema.sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
  });
  setCookie(res, token, expiresAt);
}

function publicUser(u: typeof schema.users.$inferSelect): AuthUser {
  return { id: u.id, email: u.email, displayName: u.displayName, settings: u.settings, createdAt: u.createdAt };
}

/** Resolve the session cookie into req.user (sliding expiry). */
export async function loadSession(req: Request, res: Response, next: NextFunction) {
  const token: unknown = req.cookies?.[COOKIE];
  if (typeof token !== "string" || token.length < 20) return next();
  const id = hashToken(token);
  const [row] = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) {
    res.clearCookie(COOKIE, { path: "/" });
    return next();
  }
  req.user = publicUser(row.user);
  // Renew when less than half the lifetime remains.
  if (row.session.expiresAt.getTime() - Date.now() < (SESSION_DAYS / 2) * DAY_MS) {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
    await db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.id, id));
    setCookie(res, token, expiresAt);
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, "Not signed in");
  next();
}

/**
 * CSRF defence: cookies are SameSite=Lax and every state-changing request must
 * come from our own origin (browsers always send Origin on cross-site POSTs).
 */
export function sameOriginGuard(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      throw new HttpError(403, "Invalid origin");
    }
    const expected = req.get("x-forwarded-host") ?? req.get("host");
    if (host !== expected) throw new HttpError(403, "Cross-origin request blocked");
  }
  next();
}

async function registrationOpen(): Promise<boolean> {
  if (env.ALLOW_REGISTRATION) return true;
  const [row] = await db.select({ n: count() }).from(schema.users);
  return (row?.n ?? 0) === 0;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});

export const authRouter = Router();

authRouter.get("/status", async (_req, res) => {
  res.json({ registrationOpen: await registrationOpen() });
});

authRouter.get("/me", (req, res) => {
  if (!req.user) throw new HttpError(401, "Not signed in");
  res.json({ user: req.user });
});

authRouter.post("/register", loginLimiter, async (req, res) => {
  if (!(await registrationOpen())) throw new HttpError(403, "Registration is closed on this instance");
  const input = parse(registerSchema, req.body);
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash, displayName: input.displayName || email.split("@")[0] || "" })
    .onConflictDoNothing()
    .returning();
  if (!user) throw new HttpError(409, "An account with this email already exists");
  await createSession(req, res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const input = parse(loginSchema, req.body);
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, input.email.trim().toLowerCase()))
    .limit(1);
  // Always run bcrypt to keep timing uniform.
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "Incorrect email or password");
  await createSession(req, res, user.id);
  // Opportunistic cleanup of expired sessions.
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  res.json({ user: publicUser(user) });
});

authRouter.post("/logout", async (req, res) => {
  const token: unknown = req.cookies?.[COOKIE];
  if (typeof token === "string") await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

authRouter.patch("/profile", requireAuth, async (req, res) => {
  const input = parse(profileUpdateSchema, req.body);
  const userId = uid(req);
  const current = req.user!;
  const [user] = await db
    .update(schema.users)
    .set({
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.settings ? { settings: { ...current.settings, ...input.settings } } : {}),
    })
    .where(eq(schema.users.id, userId))
    .returning();
  res.json({ user: publicUser(user!) });
});

authRouter.post("/password", requireAuth, loginLimiter, async (req, res) => {
  const input = parse(passwordChangeSchema, req.body);
  const userId = uid(req);
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash)))
    throw new HttpError(400, "Current password is incorrect");
  await db
    .update(schema.users)
    .set({ passwordHash: await bcrypt.hash(input.newPassword, 12) })
    .where(eq(schema.users.id, userId));
  // Sign out other sessions.
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  await createSession(req, res, userId);
  res.json({ ok: true });
});
