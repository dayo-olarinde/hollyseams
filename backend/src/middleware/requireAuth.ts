import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { ApiError } from "../utils/apiResponse";
import { redis, sessionKey } from "../config/redis";
import { sessionSchema } from "../validations/session.validation";

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const sessionId = req.cookies?.sessionId as string | undefined;
  if (!sessionId) throw new ApiError(401, "Not authenticated");

  const sessionData = await redis.get(sessionKey(sessionId));
  if (!sessionData) throw new ApiError(401, "Session expired");

  const parsed = sessionSchema.safeParse(JSON.parse(sessionData));
  if (!parsed.success) {
    await redis.del(sessionKey(sessionId));
    throw new ApiError(401, "Invalid session");
  }

  req.user = parsed.data;

  await redis.expire(sessionKey(sessionId), env.SESSION_TTL_SECONDS);

  next();
}
