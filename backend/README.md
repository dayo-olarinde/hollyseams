# Hollyseams — Backend

The Hollyseams API: NestJS 12 on Fastify 5, with its client in [`../frontend`](../frontend).
Customers, measurements, jobs, payments and reports live in PostgreSQL; sessions and rate limits
live in Redis.

| | |
|---|---|
| Port | **7000** — what `frontend/` proxies to |
| Database | PostgreSQL 16 (Drizzle ORM; migrations and seed in `src/database/`) |
| Tests | Vitest + `@nestjs/testing`, HTTP tests through `app.inject()` |

## Stack

- **Runtime:** Bun 1.3 (no compile step in dev — see the decorator-metadata note below)
- **Framework:** NestJS 12 (`@nestjs/platform-fastify`, Fastify pinned to **5.12.1**)
- **Database:** PostgreSQL 16 via Drizzle ORM — schema, migrations and seed in `src/database/`
- **Cache / sessions:** Redis 7 via ioredis (opaque session ids → user, TTL)
- **Validation:** Zod 4 schemas bound directly to parameters (Nest 12 Standard Schema)
- **Config:** one zod schema + an injected `ENV` token; `.env` is loaded by Bun, so there is
  no `@nestjs/config`
- **Logging:** Nest's built-in `Logger` (readable lines in the terminal) + one Fastify
  `onResponse` hook for request lines. **No pino, on purpose:** at this size logs are read in a
  terminal, not queried; add pino-http when they are shipped or searched instead.
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
source of truth and fails the boot when something required is missing). If your `.env` still
carries `PORT=7001` from an earlier setup, set it to `7000` — that is what `frontend/` proxies
to. The process environment **wins over** `.env` (standard dotenv behaviour), so
`PORT=7000 bun run dev` works before you edit it. If a shell exports its own `PORT` (some do,
with `0`), the app exits with `Invalid environment variables: PORT: Too small`; start it with
`env -u PORT bun src/main.ts` to let `.env` win.

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
    ├── auth/           # sessions, guards, cookies
    ├── customers/      # CRUD + cursor pagination
    ├── subjects/       # nested routes + a transaction
    ├── jobs/           # four transactions + payment idempotency + photo uploads
    └── reports/        # raw SQL aggregates (no query builder)
```

Each feature module: `<feature>.module.ts` (DI boundary) → `<feature>.controller.ts`
(HTTP only) → `<feature>.service.ts` (business logic) → optional `<feature>.store.ts`
(data access) + `*.schema.ts` (Zod wire contracts). Dependencies point one way:
`main.ts → app.module.ts → feature modules → config/database/redis → nothing`.

## Status

All five feature modules are done — auth (login/logout/session guard), customers
(list/create/get/update with cursor pagination), subjects (measurements + history), jobs
(list/get/create/update/delete, the four transactions, payments, photo uploads via Cloudinary)
and reports (three raw-SQL aggregates) — plus the photo cleanup queue (BullMQ: a deleted or
replaced photo is released off the request path, 5 retries with exponential backoff),
Redis-backed rate limiting, the error envelope, graceful shutdown, and the test suite: 152
tests, HTTP tests running the real pipeline with Postgres, Redis and Cloudinary overridden (no
network).

**Error mapping.** A failed query never returns the driver's message.
`src/database/db-error.ts` maps Postgres SQLSTATEs to safe responses: `23505` → 409 naming the
conflicting field, `23503` → 400, `22P02` → 400, anything else → 500 `A database error occurred.`
with the SQLSTATE logged and never serialised into the body.

**Idempotent payments.** `POST /jobs/:jobId/payments` requires an `Idempotency-Key: <uuid>`
header and records at most one payment per key: a repeated delivery of the same intent returns
the payment the first delivery committed, with `Idempotent-Replay: true`, and the same key sent
with different money answers 409. The key lives in `payments.idempotency_key` (migration `0009`
in `src/database/migrations/`); the numbered flow ([1/12]–[12/12], frontend to backend) lives in
`src/modules/jobs/jobs.service.ts` → `createPayment`.

Dev tooling lives here: `drizzle.config.ts`, `scripts/migrate.ts`, `database/seed.ts` and the
Postgres/Redis `docker-compose.yml`.
