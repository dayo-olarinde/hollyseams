# Hollyseams

A tailor management application for tracking customers, measurements, jobs, and payments.

## Structure

```
hollyseams/
├── backend/          # NestJS 12 + Fastify 5 API (Bun + TypeScript)
├── frontend/         # Next.js 15 + TypeScript web application
└── README.md
```

## Backend

See [backend/README.md](backend/README.md) for full documentation.

- **Runtime:** Bun
- **Framework:** NestJS 12 on Fastify 5
- **Database:** PostgreSQL 16 via Drizzle ORM (migrations and seed live in `backend/`)
- **Auth:** PIN-based (Argon2 + pepper), Redis-backed sessions
- **Cache:** Redis 7 (ioredis)
- **Health:** `GET /health` pings Postgres and Redis and returns `503` when either is down
- **Payments:** idempotent — one `Idempotency-Key` per payment intent

## Frontend

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Runtime:** Bun
- **Styling:** Tailwind CSS
- **Design:** Apple HIG — see [docs/design-system.md](docs/design-system.md) for the full design system (colours, typography, motion, components)
- **API access:** the browser only talks to its own origin; `/api/*` is rewritten to the API server in `frontend/next.config.ts` (`http://localhost:7000` by default)
- **Navigation:** `/dashboard` is one route with the four tabs as a `?tab=` query param, so switching tabs re-renders from the cache instead of unmounting the page

## Getting Started

```bash
# 1. Backend: install, infrastructure, schema, user
cd backend
cp .env.example .env    # fill in the values
bun install
bun run docker:up       # Postgres 16 + Redis 7
bun run db:migrate      # applies src/database/migrations
bun run seed            # creates the single user from SEED_PIN

# 2. Start the API (:7000)
bun run dev

# 3. Start the frontend, in another terminal
cd ../frontend && bun install
bun run dev             # :3000
```
