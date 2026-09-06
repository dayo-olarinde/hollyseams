# hollyseams

Backend service scaffolded with Bun + Express + TypeScript.

## Stack

- **Runtime:** [Bun](https://bun.sh)
- **Framework:** Express 5
- **Language:** TypeScript (strict)
- **Database:** PostgreSQL 16 (Docker) via [Drizzle ORM](https://orm.drizzle.team) + raw `postgres-js`
- **Validation:** Zod
- **Logging:** Pino (+ `pino-http` request logging)
- **Testing:** Vitest
- **Lint/Format:** ESLint + Prettier
- **Cache:** Redis 7 (ioredis)
- **Queues:** BullMQ
- **Rate limiting:** `express-rate-limit` (Redis store)

## Prerequisites

- [Bun](https://bun.sh)
- [Docker](https://docs.docker.com/engine/install/) + Docker Compose

## Getting started

```bash
# 1. Install dependencies
bun install

# 2. Start infrastructure (Postgres [+ Redis])
bun run docker:up

# 3. Push the schema to the database
bun run db:push        # or: db:generate then db:migrate

# 4. Run the dev server (hot reload)
bun run dev
```

Health check: http://localhost:7000/health

## Scripts

| Script             | Description                                        |
| ------------------ | -------------------------------------------------- |
| `dev`              | Run with hot reload                                |
| `start`            | Run without reload                                 |
| `build`            | Bundle with Bun                                    |
| `typecheck`        | Type-check only (`tsc --noEmit`)                   |
| `lint` / `lint:fix`| Lint / lint and fix                                |
| `format`           | Format with Prettier                               |
| `test` / `test:watch` | Run / watch tests (Vitest)                      |
| `db:generate`      | Generate a Drizzle migration                       |
| `db:migrate`       | Apply migrations                                   |
| `db:push`          | Push schema directly (dev)                         |
| `db:studio`        | Open Drizzle Studio                                |
| `docker:up` / `docker:down` | Start / stop infra containers             |

## Environment variables

| Variable                     | Description                              |
| ---------------------------- | ---------------------------------------- |
| `NODE_ENV`                   | `development` / `test` / `production`    |
| `PORT`                       | HTTP port                                 |
| `BASE_URL`                   | Public base URL                           |
| `FRONTEND_URL`               | CORS origin                               |
| `DATABASE_URL`               | Postgres connection string                |
| `POSTGRES_USER/PASSWORD/DB`  | Postgres credentials                      |
| `DATABASE_MAX_CONNECTIONS`   | `postgres-js` pool size                   |
| `REDIS_URL` / `REDIS_HOST` / `REDIS_PORT` | Redis connection      |

## Project structure

```
.
├── src/
│   ├── config/        # env, db, redis, auth, logger
│   ├── controllers/   # request handlers
│   ├── db/            # schema, migrations, index
│   ├── jobs/          # scheduled (node-cron) jobs
│   ├── middleware/    # auth, validation, error, rate limiting
│   ├── queues/        # BullMQ queues/workers
│   ├── routes/        # express routers
│   ├── services/      # business logic
│   ├── types/         # global type augmentation
│   ├── utils/         # helpers (asyncHandler, ApiResponse)
│   ├── validations/   # zod schemas
│   ├── app.ts         # express app
│   └── server.ts      # bootstrap + graceful shutdown
├── tests/
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── drizzle.config.ts
```

## Notes

- **BullMQ:** `src/queues/example.queue.ts` shows a Queue + Worker wired into
  graceful shutdown. Requires Redis.
