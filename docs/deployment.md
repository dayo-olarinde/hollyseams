# Deployment runbook — Vercel (web) · Render (API) · Neon (Postgres) · Upstash (Redis)

Deploy in this order: **Neon → Upstash → Render API → migrate/seed → Vercel web → wire FRONTEND_URL**.

## 0. What runs where

| Piece | Where | How |
|---|---|---|
| `backend/` | Render Web Service | Docker (`backend/Dockerfile`, Bun 1) |
| `frontend/` | Vercel | Next.js 15 on Vercel's native Next runtime |
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
| `FRONTEND_URL` | the Vercel URL (step 5; any https URL boots) |
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

## 5. Vercel — the frontend

1. vercel.com → **Add New → Project** → **Import Git Repository** → pick
   `dayo-olarinde/hollyseams` (grant GitHub access if asked).
2. On the configure screen:
   - **Root Directory → Edit → `frontend`** (the repo root has no Next app — this is required)
   - Framework Preset: **Next.js** (auto-detected)
   - Build/Output settings: leave default
3. **Environment Variables** → add for Production (and Preview):
   - `API_ORIGIN = https://hollyseams-api.onrender.com` (exact URL from the Render service page)
4. **Deploy** → copy the deployment URL (`https://<project>.vercel.app`).
5. Why the env var: `next.config.ts` rewrites `/api/*` to `API_ORIGIN` **server-side**, so the
   browser only ever talks to the Vercel origin. The session cookie is `SameSite=Strict` — a
   cross-origin browser call would silently drop it. Changing `API_ORIGIN` later needs a redeploy.

## 6. Wire the ends together

1. On `hollyseams-api`, set `FRONTEND_URL=https://<project>.vercel.app` → **Save**
   (triggers a redeploy; this feeds CORS).
2. Open the Vercel URL → log in with `SEED_PIN` → create a customer/job → upload then delete a
   photo → API logs show the BullMQ cleanup job run.
3. Quick checks: `curl https://hollyseams-api.onrender.com/health` → 200; a few wrong PINs
   show the exponential lockout message.

## 7. Free-tier realities

- Vercel Hobby: no sleep on the frontend; preview deployments for every branch come free.
- Render free web services **sleep after ~15 min idle**; the next API request takes ~50 s.
  Starter removes the sleep — worth it for an app someone uses daily.
- Neon free autosuspends after ~5 min idle; the first query wakes it (~500 ms).
- Upstash free: ~500K commands/month — plenty for one user; command volume is the limit to watch.
- Render auto-deploys the API on push to `main`; Vercel auto-deploys the frontend; migrations
  stay manual (step 4).

## Appendix — Option B: keep the frontend on Render

If one dashboard matters more than Vercel's fit: **New + → Web Service** on Render, same repo,
Language **Node**, Root Directory `frontend`, Build `bun install --frozen-lockfile && bun run build`,
Start `bunx next start -H 0.0.0.0 -p $PORT`, Health Check `/`, env `API_ORIGIN` as above.
Trade-off: free Render web services sleep after ~15 min idle.
