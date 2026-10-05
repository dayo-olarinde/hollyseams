# Deployment runbook — Render (API + web) · Neon (Postgres) · Upstash (Redis)

Deploy in this order: **Neon → Upstash → API → migrate/seed → web → wire FRONTEND_URL**.

## 0. What runs where

| Piece | Where | How |
|---|---|---|
| `backend/` | Render Web Service | Docker (`backend/Dockerfile`, Bun 1) |
| `frontend/` | Render Web Service | Node runtime (Next.js 15) |
| Postgres | Neon | Drizzle migrations via `bun run db:migrate` |
| Redis | Upstash | ioredis + BullMQ over the TLS endpoint |

Pick ONE region for everything (e.g. Frankfurt / eu-central-1) so the hops stay short.

## 1. Neon — Postgres

1. console.neon.tech → **New Project** → name `hollyseams` → Postgres 16 → region matching Render.
2. Dashboard → **Connection Details** — you need TWO strings:
   - **Pooled** (host contains `-pooler`, ends with `?sslmode=require`) → `DATABASE_URL` for the running app (step 3).
   - **Direct** (no `-pooler`) → for migrations from your machine (step 4).
3. Never create tables by hand — migrations own the schema.

## 2. Upstash — Redis

1. console.upstash.com → **Create Database** → name `hollyseams` → same region as Render.
2. Database page → **Connect** → under *Redis client*, copy the **TLS URL**:
   `rediss://default:<password>@<host>:6379`
3. ⚠️ NOT the REST API URL — ioredis and BullMQ speak the Redis protocol. `rediss://` (double s) is what turns TLS on.
4. That whole string is `REDIS_URL`.

## 3. Render — the API (Docker)

dashboard.render.com → **New + → Web Service** → *Build and deploy from a Git repository* →
connect GitHub, allow access to `dayo-olarinde/hollyseams` → select the repo.

| Setting | Value |
|---|---|
| Name | `hollyseams-api` |
| Language | **Docker** |
| Root Directory | `backend` |
| Dockerfile Path | `./Dockerfile` |
| Region | same as Neon/Upstash |
| Instance Type | Free (sleeps) or Starter |
| Health Check Path | `/health` |
| Auto-Deploy | Yes — every push to `main` deploys |

**Environment** (the app fail-fasts at boot; a missing key logs
`Invalid environment variables: - <KEY>`):

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon **pooled** string |
| `DATABASE_MAX_CONNECTIONS` | `5` |
| `REDIS_URL` | Upstash `rediss://…` string |
| `FRONTEND_URL` | `https://hollyseams-web.onrender.com` (step 5; any https URL boots) |
| `SEED_PIN` | the login PIN you choose |
| `PEPPER` | `openssl rand -hex 32` |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | from the Cloudinary console |
| `PORT` | leave unset — Render injects it |

Deploy. The log should end with `Dependencies are ready` then `Server listening on port …`
(`main.ts` retries Postgres/Redis 10×1s at boot, absorbing cold starts).

## 4. Migrate + seed (from your machine)

The Docker image ships only `dist/` — `scripts/migrate.ts` and the migration SQL are not
inside it, so migrations **cannot** run as a Render pre-deploy command. Run them locally
against Neon:

```bash
cd backend
DATABASE_URL='<Neon DIRECT string>' bun run db:migrate
DATABASE_URL='<Neon DIRECT string>' SEED_PIN='<same PIN as Render>' bun run seed
```

- Use the **direct** string for migrations, not pooled (transaction-mode pooling + DDL = pain).
- `seed` creates the single tailor user from `SEED_PIN`; it is a no-op if the user exists.
- After schema changes: `bun run db:generate` locally, commit the migration files, then
  re-run this step before/with the deploy.

## 5. Render — the frontend (Node)

**New + → Web Service** → same repo →

| Setting | Value |
|---|---|
| Name | `hollyseams-web` |
| Language | **Node** |
| Root Directory | `frontend` |
| Build Command | `bun install --frozen-lockfile && bun run build` |
| Start Command | `bunx next start -H 0.0.0.0 -p $PORT` |
| Health Check Path | `/` |
| Environment | `API_ORIGIN=https://hollyseams-api.onrender.com` |

Why the env var: `next.config.ts` rewrites `/api/*` to `API_ORIGIN` **server-side**, so the
browser only ever talks to the web service's own origin. The session cookie is
`SameSite=Strict` — a cross-origin browser call would silently drop it. (Render's Node
runtime ships Bun natively, so the `bun` commands work.)

## 6. Wire the ends together

1. On `hollyseams-api`, set `FRONTEND_URL=https://hollyseams-web.onrender.com` → **Save**
   (triggers a redeploy; this feeds CORS).
2. Open the web URL → log in with `SEED_PIN` → create a customer/job → upload then delete a
   photo → API logs show the BullMQ cleanup job run.
3. Quick checks: `curl https://hollyseams-api.onrender.com/health` → 200; a few wrong PINs
   show the exponential lockout message.

## 7. Free-tier realities

- Render free web services **sleep after ~15 min idle**; the next request takes ~50 s.
  Starter removes the sleep — worth it for an app someone uses daily.
- Neon free autosuspends after ~5 min idle; the first query wakes it (~500 ms).
- Upstash free: ~500K commands/month — plenty for one user; command volume is the limit to watch.
- Both Render services auto-deploy on push to `main`; migrations stay manual (step 4).
