import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Request, RequestHandler, Response } from "express";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { env } from "../config/env";
import { redis } from "../config/redis";

const isProd = env.NODE_ENV === "production";

const TOO_MANY_REQUESTS_MESSAGE = "Too many requests, please try again later.";

const sendCommand = (command: string, ...args: string[]): Promise<RedisReply> =>
  redis.call(command, ...args) as Promise<RedisReply>;

const limitExceededHandler =
  (message: string) =>
  (_req: Request, res: Response): void => {
    res.status(429).json({
      success: false,
      statusCode: 429,
      message,
      data: null,
    });
  };

export const apiLimiter: RequestHandler = rateLimit({
  windowMs: 60 * 1000,
  limit: isProd ? 120 : 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: new RedisStore({ sendCommand }),
  handler: limitExceededHandler(TOO_MANY_REQUESTS_MESSAGE),
});

export interface CreateLimiterOptions {
  keyGenerator: (req: Request) => string | undefined;
  limit: number;
  windowMinutes: number;
  message?: string;
}

export interface RateLimiter {
  middleware: RequestHandler;
  resetKey: (key: string) => Promise<void>;
}

export const createLimiter = ({
  keyGenerator,
  limit,
  windowMinutes,
  message,
}: CreateLimiterOptions): RateLimiter => {
  const store = new RedisStore({ sendCommand });

  return {
    middleware: rateLimit({
      windowMs: windowMinutes * 60 * 1000,
      limit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      store,
      keyGenerator: (req) =>
        keyGenerator(req) ?? ipKeyGenerator(req.ip ?? "127.0.0.1"),
      handler: limitExceededHandler(message ?? TOO_MANY_REQUESTS_MESSAGE),
    }),

    resetKey: (key: string) => store.resetKey(key),
  };
};

const { middleware: loginLimiter, resetKey: resetLoginLimiterKey } =
  createLimiter({
    keyGenerator: () => "login",
    limit: 5,
    windowMinutes: 15,
    message: "Too many login attempts. Wait 15 minutes.",
  });

export { loginLimiter, resetLoginLimiterKey };
