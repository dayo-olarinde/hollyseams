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
  logger.warn(
    `PIN is: ${pin} — write this down and remove it from this script.`,
  );

  process.exit(0);
}

seed().catch((error) => {
  logger.error("Seeding failed", error);
  process.exit(1);
});
