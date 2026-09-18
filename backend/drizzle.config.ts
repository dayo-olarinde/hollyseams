import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — schema generation only; migrations are applied by `scripts/migrate.ts`.
 *
 * `schema` points at the barrel (`src/database/index.ts`) so a new schema file is picked up by
 * exporting it there, the same way the DI graph picks it up. Bun loads `.env` before a
 * `bun run …` script starts, which is why this file needs no `dotenv` import — the app has no
 * such dependency (see the README's env note).
 */
export default defineConfig({
  schema: "./src/database/index.ts",
  out: "./src/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
