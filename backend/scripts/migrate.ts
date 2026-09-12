/**
 * Apply pending drizzle migrations.
 *
 * This exists because `drizzle-kit migrate` FAILS on any database that has
 * already been migrated: its bootstrap statements (`CREATE SCHEMA IF NOT
 * EXISTS drizzle`, `CREATE TABLE IF NOT EXISTS __drizzle_migrations`) reply
 * with NOTICE ("already exists, skipping"), and the CLI's postgres.js driver
 * surfaces those NOTICEs as fatal errors — so migration #2 and beyond can
 * never run. Running the same migrator through drizzle-orm directly with
 * `onnotice: () => {}` suppresses exactly those harmless notices.
 *
 * Usage: bun scripts/migrate.ts   (or `bun run db:migrate`)
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import "dotenv/config";
import { logger } from "../src/config/logger";

const sql = postgres(process.env.DATABASE_URL!, {
  onnotice: () => {},
  max: 1,
});

try {
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  logger.info("Migrations applied");
} finally {
  await sql.end();
}