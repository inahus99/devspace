# DevSpace — Personal Developer Learning OS

One place for everything you're learning:
- Workspaces with nested folders.
- Rich and Markdown notes with pasted screenshots.
- Code snippets.
- A DSA tracker with spaced revision.
- LLD exercises.
- A resource library.
- A bookshelf.
- A daily planner and master calendar.
- Analytics computed from what you actually did.

**Stack:**
- Frontend: React 19 + Vite + Tailwind v4 + shadcn/ui, TipTap and Monaco.
- Backend: Express 5 + Drizzle ORM on **PostgreSQL**.
- Auth: cookie sessions.
- Uploads: on disk (Railway Volume) or S3-compatible storage.

The API and the built SPA run as **one service**.

---

## Local development

Requirements: Node 20+ and a Postgres 14+ database.

```bash
# 1. Postgres (any instance works — this is a throwaway Docker one on port 5433)
docker run -d --name devspace-pg -p 5433:5432 \
  -e POSTGRES_USER=devspace -e POSTGRES_PASSWORD=devspace -e POSTGRES_DB=devspace postgres:16-alpine

# 2. Config
cp .env.example .env        # then set SESSION_SECRET; set ALLOW_REGISTRATION=true if you want more than one account

# 3. Install, migrate, run
npm install
npm run db:migrate
npm run dev                 # API on :3000, Vite on :5173 (proxies /api)
```

Open http://localhost:5173. The first visit shows **Create your DevSpace**. The first account can always be registered.

| Script | What it does |
| --- | --- |
| `npm run dev` | API (tsx watch) + Vite dev server |
| `npm run build` | Builds the SPA to `dist/` and bundles the server to `dist-server/` |
| `npm start` | Runs pending migrations, then serves API + SPA on `$PORT` |
| `npm run db:generate` | Generates a migration after editing `server/db/schema.ts` |
| `npm run db:migrate` | Applies migrations in `drizzle/` |
| `npm run typecheck` | Type-checks client and server |
| `node scripts/smoke.mjs` | End-to-end API test against a running server (see below) |

---

## Deploying on Railway

`railway.json` already configures the build, the start command and the `/api/health` healthcheck.

1. **New project → Deploy from GitHub repo**, and pick this repository.
2. **Add Postgres:** `+ New → Database → PostgreSQL`.
3. **Service variables:** on the DevSpace service, set these variables.

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `SESSION_SECRET` | output of `openssl rand -hex 32` |
   | `NODE_ENV` | `production` |
   | `UPLOAD_DIR` | `/data/uploads` |
   | `ALLOW_REGISTRATION` | `false` (the first account can always be created) |

4. **Uploads volume:** right-click the service → **Attach Volume**, mount path `/data`.

   Without a volume, uploaded images are lost on every redeploy. Alternatively, set `STORAGE_DRIVER=s3` and the `S3_*` variables to use a Railway Bucket, Cloudflare R2 or AWS S3.
5. **Public URL:** Settings → Networking → **Generate Domain**. Open it and create your account.

Migrations run automatically on every deploy (`npm start` runs `migrate.js` first), so schema changes ship with the code.

**Backups:**
- Railway Postgres has its own backups.
- Settings → *Export* in the app downloads a full JSON backup.
- It also offers a ZIP archive with Markdown notes, code files, CSVs and every uploaded file.

### Forgot your password?

There's no email reset. Instead, run the reset command from a shell that can reach the database. It changes the password and signs out every device.

```bash
# On Railway: open a shell inside the running DevSpace service…
railway ssh
# …then:
npm run reset-password -- you@example.com              # prompts for the new password (hidden)
npm run reset-password -- you@example.com --generate   # sets a random one and prints it once
npm run reset-password -- --list                       # which emails exist
```

Locally, use `npm run reset-password:dev -- …` instead; it runs from source and reads `.env`.

---

## How it fits together

```
server/        Express API
  db/          Drizzle schema (18 normalised tables) + pool
  routes/      content (notes, snippets, resources, DSA, LLD, books), workspaces/folders,
               activities, attachments/files, insights (search, dashboard, stats), export
  lib/         generic owned-entity CRUD router, ref ownership checks, tags, HTTP helpers
  auth.ts      sessions (HMAC-hashed tokens), login rate limit, same-origin CSRF guard
  storage.ts   disk / S3 drivers + deferred deletion queue
shared/        Zod input schemas, enums, overlap-safe time math — used by client and server
src/           React app (features/*, components/*, lib/queries.ts)
drizzle/       SQL migrations (incl. trigram search indexes and attachment cleanup trigger)
```

### Data and security notes

**Ownership and isolation**
- Every row is owned by a user, and every query filters by the signed-in user.
- Foreign IDs in a request (workspace, folder, linked note or problem) are checked for ownership before any write.
- A folder must belong to the item's workspace.

**Activities and time**
- **Activities** are the single source for the planner, the calendar, the dashboard and analytics.
- Overlapping sessions are merged, so 9:00–10:30 and 10:00–11:00 count as 120 minutes, not 150.
- Shared minutes are split across workspaces.

**Resources and files**
- Resources added inside a workspace are the same rows the Resource Library shows, so nothing is duplicated.
- Deleting a note, problem or book removes its attachments.
- Deleted files are removed from storage by a queue that survives crashes.
- Uploaded files are served from `/api/files/:id` only to their owner, with `nosniff` and a sandboxing CSP.

### Smoke test

The test exercises every journey, user isolation, overlap maths and cascades.

```bash
npm run dev:server           # needs ALLOW_REGISTRATION=true in .env
node scripts/smoke.mjs
```

---

## Known limitations

- Restoring from the JSON backup isn't implemented yet. The export format (`devspace-backup` v1) is stable so an importer can be added.
- Calendar events are edited through the activity dialog; there is no drag-to-reschedule.
- No email-based password reset. Change your password in Settings, or use `npm run reset-password` (above).
