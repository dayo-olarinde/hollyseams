/**
 * One-time bootstrap: creates the app's single user (the tailor) from `SEED_PIN`.
 *
 * Run via `bun run seed` after the schema is migrated. The PIN is hashed with argon2 and the
 * server-side pepper *before* it touches the database, using the same `PinHasherService` the
 * login path verifies with — so a seeded row can never drift from what login expects.
 *
 * Unlike the Express seed this is safe to run twice: the app has exactly one user, and a second
 * row would make "which user is this session" ambiguous instead of just being untidy.
 */
import { Logger } from "@nestjs/common";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { parseEnv } from "../config/env.schema";
import { PinHasherService } from "../modules/auth/pin-hasher.service";
import * as schema from "./index";
import { userTable } from "./schema/user";

const logger = new Logger("Seed");

// Same env contract as the app itself: fail loudly on a missing variable, never half-seed.
const env = parseEnv();

const sql = postgres(env.DATABASE_URL, { onnotice: () => {}, max: 1 });

try {
  const db = drizzle(sql, { schema });

  const [existing] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .limit(1);

  if (existing) {
    logger.log("A user already exists — nothing to seed.");
  } else {
    const pinHash = await new PinHasherService(env).hashPin(env.SEED_PIN);

    const [user] = await db
      .insert(userTable)
      .values({ firstName: "Wunmi", pinHash })
      .returning();

    if (!user) throw new Error("Failed to seed user");

    logger.log(`User created: ${user.firstName} (id: ${user.id})`);
    // Deliberately loud: SEED_PIN is an environment secret, not a default worth trusting.
    logger.warn(`PIN is: ${env.SEED_PIN} — change it in .env before this is deployed.`);
  }
} finally {
  await sql.end();
}
