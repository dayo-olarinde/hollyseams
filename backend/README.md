# Hollyseams — Backend

Express 5 + Bun + TypeScript API server for the Hollyseams tailor app
(customers, subjects, measurements, jobs, payments, reports).

## Stack

- **Runtime:** Bun (`.ts` files run directly; `bun build` bundles for deploy)
- **Framework:** Express 5 — async handlers need no wrapper: rejected
  promises are forwarded to the error middleware natively
- **Database:** PostgreSQL 16, Drizzle ORM (`drizzle-orm/postgres-js`)
- **Cache / sessions:** Redis 7 via ioredis (opaque session ids → user, TTL)
- **Auth:** single-user PIN (Argon2id + server-side pepper). `utils/hash.util.ts` also
  carries a `dummyVerify` helper for timing-equalizing the no-user path; it is deliberately
  left unwired, because with one seeded user that branch is unreachable and the extra Argon2
  work would be paid on every failed login (ADR-006).
- **Photos:** Cloudinary — browsers upload directly with server-issued
  signatures; the DB only ever stores server-verified URLs
- **Validation:** zod schemas in `src/validations/` double as the type
  source for services (`z.infer`), so wire contract and TS types can't drift

## Env

Copy `.env.example` → `.env` and fill in real values. The zod schema in
`src/config/env.ts` validates every variable at startup and aborts with a
clear error if a REQUIRED one is missing. Variables used only by
`docker-compose.yml` (the `POSTGRES_*` trio, `POSTGRES_PORT`, `REDIS_PORT`)
stay in `.env` but are intentionally NOT part of the app's schema — the app
connects via `DATABASE_URL` / `REDIS_URL`.

## Scripts (`bun run …`)

| Script | What it does |
|--------|--------------|
| `dev` | Start the API with watch mode (`bun --watch src/server.ts`) |
| `start` | Start the API (no watch) |
| `build` | Bundle `src/server.ts` into `dist/` for the Bun runtime |
| `typecheck` | `tsc --noEmit` |
| `test` / `test:watch` | Vitest suite (`tests/`) |
| `db:generate` | Drizzle: generate a migration from schema changes |
| `db:migrate` | Apply pending migrations (see `scripts/migrate.ts` — the plain `drizzle-kit migrate` CLI fails on already-migrated DBs) |
| `db:push` | Drizzle: push schema directly (dev shortcut) |
| `db:studio` | Drizzle Studio browser UI |
| `seed` | Create the single user row with the PIN from `SEED_PIN` |
| `docker:up` / `docker:down` | Start/stop Postgres + Redis containers |

## Layout

```
src/
├── app.ts            # Express app: middleware chain, routers, terminal 404/error
├── server.ts         # Bootstrap: dependency wait, listen, graceful shutdown
├── config/           # env (zod), logger (pino), db, redis, cloudinary
├── controllers/      # Thin HTTP layer: parse request → call service → envelope
├── services/         # Business logic + all SQL/ORM access
├── middleware/       # requireAuth (session), validation trio, rate limiters, errors
├── routes/           # Path → middleware chain → controller
├── utils/            # apiResponse envelope, keyset cursor helpers, jobs-filter
├── validations/      # zod wire schemas (also the TS types for services)
├── db/               # schema/* (Drizzle tables), migrations/, seed.ts
├── scripts/          # migrate.ts
└── types/            # express.d.ts (req.user augmentation)
```

## Notes on deliberate choices

- **Keyset pagination** (`utils/cursor.ts`): every list endpoint pages by
  `(sort_column, id)` tuples instead of OFFSET — one ordered scan per page,
  stable under inserts/deletes. Cursors are validated and bound as
  parameters, never spliced into SQL.
- **Response envelope** (`utils/apiResponse.ts`): every endpoint returns
  `{ success, statusCode, message, data?, meta? }`; the frontend's axios
  interceptor depends on this shape — keep it stable.
- **Graceful shutdown** (`server.ts`): stops accepting requests, drains
  in-flight ones, then closes Redis + Postgres.