import { rateLimit } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { env } from "../config/env";
import { redis } from "../config/redis";

const isProd = env.NODE_ENV === "production";

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isProd ? 120 : 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<RedisReply>,
    prefix: "hollyseams:rl:",
  }),
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});
