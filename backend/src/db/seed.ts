// One-time bootstrap: creates the app's single user (the tailor) with a
// PIN from SEED_PIN. Run via `bun run seed` after the schema is migrated.
// The PIN is hashed with argon2 + pepper BEFORE it touches the database —
// the raw PIN never exists outside this process.
import { db } from "../config/db";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { ApiError } from "../utils/apiResponse";
import { hashPin } from "../utils/hash.util";
import { userTable } from "./schema/user";

async function seed() {
  const firstName = "Wunmi";
  const pin = env.SEED_PIN;

  logger.info("⏳ Seeding user...");

  const pinHash = await hashPin(pin);

  const [user] = await db
    .insert(userTable)
    .values({ firstName, pinHash })
    .returning();

  if (!user) throw new ApiError(500, "Failed to seed user");

  logger.info(`User created: ${user.firstName} (id: ${user.id})`);
  // Deliberately LOUD warning: SEED_PIN sits in .env (source of truth) and
  // this line re-prints it so it's impossible to miss that the login PIN
  // is an environment secret, not a hardcoded default.
  logger.warn(
    `PIN is: ${pin} — write this down and remove it from this script.`,
  );

  process.exit(0); // explicit exit — no server is listening, nothing to keep alive
}

seed().catch((error) => {
  logger.error("Seeding failed", error);
  process.exit(1);
});
