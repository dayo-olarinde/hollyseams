# Hollyseams — Backend (NestJS + Fastify)

The NestJS 12 + Fastify 5 implementation of the Hollyseams API — **the app the project runs**,
with its client in `frontend/`. It replaced the Express app that used to live in `backend/`;
that app survives in this working copy as untracked `backend-express/` and in git history, kept
for the side-by-side comparison every route was verified against.

| | |
|---|---|
| Directory | `backend/` |
| Port | **7000** — what `frontend/` proxies to |
| Status | **the live implementation** (auth, customers, subjects, jobs, reports) |

**One line of cutover is left to you:** `PORT` in `.env` is still `7001` from the
side-by-side period. Set it to `7000` (the value `.env.example` already documents) — the
process environment wins over `.env`, so `PORT=7000 bun run dev` works before the flip too.

## Stack

- **Runtime:** Bun 1.3 (no compile step in dev — see the decorator-metadata note below)
- **Framework:** NestJS 12 (`@nestjs/platform-fastify`, Fastify pinned to **5.12.1**)
- **Database:** PostgreSQL 16 via Drizzle ORM — same database and schema as `backend/`
- **Cache / sessions:** Redis 7 via ioredis (opaque session ids → user, TTL)
- **Validation:** Zod 4 schemas bound directly to parameters (Nest 12 Standard Schema)
- **Config:** one zod schema + an injected `ENV` token; `.env` is loaded by Bun, so there is
  no `@nestjs/config` (§17.2)
- **Logging:** Nest's built-in `Logger` (readable lines in the terminal) + one Fastify
  `onResponse` hook for request lines. **No pino, on purpose** — see
  [`../hollyseams-nestjs-migration-guide.md`](../hollyseams-nestjs-migration-guide.md) §17.1,
  which also lists the trigger and the exact steps for adding it back when logs are shipped
  rather than read
- **Tests:** Vitest + `@nestjs/testing`, HTTP tests through `app.inject()`

## Scripts (`bun run …`)

| Script | What it does |
|--------|--------------|
| `dev` | `bun --watch src/main.ts` |
| `start` | `bun src/main.ts` |
| `build` | `tsc -p tsconfig.build.json` → `dist/` |
| `start:dist` | Run the compiled output (`bun dist/main.js`) |
| `typecheck` | `tsc --noEmit` |
| `test` / `test:watch` | Vitest suite (`tests/`) |
| `db:generate` | Drizzle: generate a migration from schema changes |
| `db:migrate` | Apply pending migrations (`scripts/migrate.ts` — see the script for why not the CLI) |
| `seed` | Create the single user from `SEED_PIN` (no-op if one already exists) |
| `docker:up` / `docker:down` | Postgres 16 + Redis 7 (`docker-compose.yml`, project `hollyseams`) |

`bun build` is deliberately **not** used: it cannot resolve Nest's optional peer
dependencies (`class-transformer`), and the app needs no bundling.

## Local setup

```sh
bun install
bun run docker:up     # Postgres + Redis; `name: hollyseams` reuses the existing volumes
bun run db:migrate    # applies src/database/migrations
bun run seed          # the single user, from SEED_PIN in .env
bun run dev           # :7000
```

`docker-compose.yml` reads `POSTGRES_*`/`REDIS_*` from the same `.env` the app does — one
source of truth for what database the stack and the app mean.

Three things a NestJS app depends on that are easy to get wrong here:

1. `tsconfig.json` must keep `experimentalDecorators` **and** `emitDecoratorMetadata`.
   Nest's DI reads the emitted `design:paramtypes`; without them Bun emits nothing and
   startup fails with "Nest can't resolve dependencies".
2. `main.ts` must `import "reflect-metadata"` first — Bun does not implement
   `Reflect.metadata` itself.
3. `fastify` must stay pinned to the version `@nestjs/platform-fastify` depends on.
   Two copies of the package mean two distinct `FastifyInstance` types and every plugin
   registration fails to type-check.

## Env

Same variables as `.env.example` (the schema in `src/config/env.schema.ts` is the single
source of truth and fails the boot when something required is missing). Note that the
process environment **wins over** `.env` — that is
standard dotenv behaviour. If a shell in your environment exports its own `PORT` (some do,
with `0`), the app exits with `Invalid environment variables: PORT: Too small`; start it
with `env -u PORT bun src/main.ts` to let `.env` win.

## Layout

```
src/
├── main.ts             # dependency wait, graceful shutdown, listen
├── setup-app.ts        # Fastify adapter + plugins + API prefix + request-log hook
│                       # (shared with tests)
├── app.module.ts       # composition root + global filter/interceptor/pipe/guard
├── config/             # zod env schema + ConfigModule (typed ENV token)
├── database/           # Drizzle schema/migrations + PG_CLIENT/DRIZZLE providers
│                       # + db-error.ts: Postgres SQLSTATE -> HTTP status mapping
├── redis/              # REDIS provider (keyPrefix, shutdown)
├── media/              # Cloudinary provider: verify uploads, sign uploads, release assets
│                       # (releasing is queued: BullMQ, 5 retries, exponential backoff)
├── common/             # framework glue: envelope + route constants, error filter,
│                       # interceptor, rate limiter, Zod validation pipe
│   ├── pagination/     # keyset-cursor helpers shared by every list endpoint
│   └── validation/     # request contracts shared by more than one feature
└── modules/            # features, one folder each
    ├── health/         # GET /health (root, outside /api/v1 and the rate limiter)
    ├── auth/           # reference implementation #1 — sessions, guards, cookies
    ├── customers/      # reference implementation #2 — CRUD + cursor pagination
    ├── subjects/       # reference implementation #3 — nested routes + a transaction
    ├── jobs/           # reference implementation #4 — 4 transactions + photo uploads
    └── reports/        # reference implementation #5 — raw SQL aggregates (no query builder)
```

Each feature module: `<feature>.module.ts` (DI boundary) → `<feature>.controller.ts`
(HTTP only) → `<feature>.service.ts` (business logic) → optional `<feature>.store.ts`
(data access) + `*.schema.ts` (Zod wire contracts). Dependencies point one way:
`main.ts → app.module.ts → feature modules → config/database/redis → nothing`.

The full Express → NestJS mapping, Fastify differences and the reasoning behind every
folder live in the migration guide.

## Status

Done: config, database, Redis, health, the auth module (login/logout/session guard), the
customers module (list/create/get/update with cursor pagination), the subjects module
(subjects + measurement history), the jobs module (list/get/create/update/delete, the
four transactions, payments, photo uploads via Cloudinary), the reports module (three raw-SQL
aggregates), the photo cleanup queue (BullMQ: a deleted or replaced photo is released off the
request path, with 5 retries and exponential backoff), Redis-backed rate limiting, the error
envelope, Postgres-error mapping, logging, graceful shutdown, and the test suite (HTTP
tests use provider overrides and `app.inject()`, no network).

Every route in the Express app's `src/routes/` exists here with the same path, status and message —
verified by running both servers against the same database and diffing responses (16/16 checks
for subjects, ~30/30 for jobs, 8/8 for reports, including all four transactions and both apps'
upload signatures verified against the real API secret). Writes that would leave rows behind are
covered by tests against a fake database; the subjects create race was additionally verified
against the real Postgres with two connections.

**One intentional divergence:** a failed constraint used to be a **500** in both apps (Express also
sent the SQL and its bound parameters to the client). It is now mapped from its SQLSTATE —
`23503` → 400, `23505` → 409, `22P02` → 400 — with a safe message, in
`src/database/db-error.ts`. See the guide §20.

**A second intentional divergence — payment idempotency:** `POST /jobs/:jobId/payments` now
requires an `Idempotency-Key: <uuid>` header and records at most one payment per key. A repeated
delivery of the same intent (double-tap, retry after a lost response, proxy redelivery) returns
the payment the first delivery committed with `Idempotent-Replay: true`, instead of inserting a
second one; the same key sent with different money answers 409. The key lives in the new
`payments.idempotency_key` column — migration `0009`, in `src/database/migrations` — and the full
numbered flow ([1/12]–[12/12], frontend to backend) lives in `src/modules/jobs/jobs.service.ts` →
`createPayment`. `frontend/` sends the key; the retired UIs kept on disk (`frontend-legacy/`,
`frontend-v2/`) never learned it, so payment requests from them answer 400.

Dev tooling lives here: `drizzle.config.ts`, `scripts/migrate.ts`, `database/seed.ts` and the
Postgres/Redis `docker-compose.yml`. The superseded apps sit beside this one as untracked
`backend-express/`, `frontend-legacy/` and `frontend-v2/` — delete them whenever the reference
copies stop being useful.
