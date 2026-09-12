import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

export const sessionKey = (sessionId: string) => `session:${sessionId}`;

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keyPrefix: "hollyseams:",
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err) => logger.error({ err }, "Redis error"));
