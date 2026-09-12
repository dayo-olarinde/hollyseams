import { randomUUID } from "crypto";
import { db } from "../config/db";
import { env } from "../config/env";
import { redis, sessionKey } from "../config/redis";
import { userTable } from "../db";
import { ApiError } from "../utils/apiResponse";
import { verifyPin } from "../utils/hash.util";
import { sessionSchema } from "../validations/session.validation";

export const loginUser = async (pin: string): Promise<string> => {
  const [user] = await db
    .select({ id: userTable.id, pinHash: userTable.pinHash })
    .from(userTable);

  if (!user) {
    throw new ApiError(401, "Incorrect PIN. Try again.");
  }

  const validPin = await verifyPin(pin, user.pinHash);
  if (!validPin) throw new ApiError(401, "Incorrect PIN. Try again.");

  const sessionId = randomUUID();
  const sessionPayload = sessionSchema.parse({ id: user.id });

  await redis.set(
    sessionKey(sessionId),
    JSON.stringify(sessionPayload),
    "EX",
    env.SESSION_TTL_SECONDS,
  );

  return sessionId;
};

export const logoutUser = async (sessionId: string): Promise<void> => {
  await redis.del(sessionKey(sessionId));
};
