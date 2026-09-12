import type { Request, Response } from "express";
import { pingDb } from "../config/db";
import { redis } from "../config/redis";
import { ApiResponse } from "../utils/apiResponse";

export const healthCheck = async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await pingDb();
    checks.database = "up";
  } catch {
    checks.database = "down";
    healthy = false;
  }

  try {
    await redis.ping();
    checks.redis = "up";
  } catch {
    checks.redis = "down";
    healthy = false;
  }

  const statusCode = healthy ? 200 : 503;
  res.status(statusCode).json(
    new ApiResponse(statusCode, healthy ? "ok" : "degraded", {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks,
    }),
  );
};
