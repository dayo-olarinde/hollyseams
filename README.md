# Hollyseams

A tailor management application for tracking customers, measurements, jobs, and payments.

## Structure

```
hollyseams/
├── backend/          # Express 5 + Bun + TypeScript API server
├── frontend/         # Next.js 15 + TypeScript web application
└── README.md
```

## Backend

See [backend/README.md](backend/README.md) for full documentation.

- **Runtime:** Bun
- **Framework:** Express 5
- **Database:** PostgreSQL 16 via Drizzle ORM
- **Auth:** PIN-based (Argon2 + pepper), Redis-backed sessions
- **Cache:** Redis 7 (ioredis)
- **Health:** `GET /health` pings Postgres and Redis and returns `503` when either is down

## Frontend

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Runtime:** Bun
- **Styling:** Tailwind CSS
- **Design:** Apple HIG — see [docs/design-system.md](docs/design-system.md) for the full design system (colours, typography, motion, components)
- **API access:** the browser only talks to its own origin; `/api/*` is rewritten to the API server in `frontend/next.config.ts`

## Getting Started

```bash
# 1. Start infrastructure
cd backend && docker compose up -d

# 2. Set up database
cd backend && bun install
bun run db:migrate   # applies src/db/migrations (db:push is the dev shortcut)

# 3. Seed the user
cp .env.example .env  # Fill in values
bun run seed

# 4. Start backend
bun run dev

# 5. Start frontend (in another terminal)
cd ../frontend && bun install
bun run dev
```
