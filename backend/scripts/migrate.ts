/**
 * Apply pending Drizzle migrations — `bun run db:migrate`.
 *
 * This exists instead of the `drizzle-kit migrate` CLI because the CLI treats Postgres NOTICEs as
 * fatal. On a database that has already been migrated, the bootstrap statements
 * (`CREATE SCHEMA IF NOT EXISTS drizzle`, `CREATE TABLE IF NOT EXISTS __drizzle_migrations`)
 * answer "already exists, skipping", and the CLI never gets to the real migrations. Going through
 * drizzle-orm's migrator with `onnotice: () => {}` suppresses exactly those harmless notices.
 *
 * (The same 15-line workaround the Express app carried in `backend/scripts/migrate.ts` — kept
 * because the database is the same one, still mid-migration.)
 */
import { Logger } from "@nestjs/common";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const logger = new Logger("Migrate");

// `max: 1` because this is a one-shot script: a pool of one is enough, and it cannot keep the
// process alive after `end()`.
const sql = postgres(process.env.DATABASE_URL!, {
  onnotice: () => {},
  max: 1,
});

try {
  await migrate(drizzle(sql), {
    migrationsFolder: "./src/database/migrations",
  });
  logger.log("Migrations applied");
} finally {
  await sql.end();
}
