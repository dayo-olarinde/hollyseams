import type { Request, Response } from "express";
import { env } from "../config/env";
import { loginUser } from "../services/login.service";
import { resetLoginLimiterKey } from "../middleware/rateLimiter.middleware";
import { ApiResponse } from "../utils/apiResponse";

export const loginUserHandler = async (req: Request, res: Response) => {
  const { pin } = req.body;

  const sessionId = await loginUser(pin);
  await resetLoginLimiterKey("login");

  res.cookie("sessionId", sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: env.SESSION_TTL_SECONDS * 1000,
  });

  res.status(200).json(new ApiResponse(200, "Login successful"));
};
