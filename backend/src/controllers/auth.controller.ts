import type { Request, Response } from "express";
import { env } from "../config/env";
import { resetLoginLimiterKey } from "../middleware/rateLimiter.middleware";
import { loginUser, logoutUser } from "../services/auth.service";
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

export const logoutUserHandler = async (req: Request, res: Response) => {
  const sessionId = req.cookies?.sessionId as string | undefined;

  if (sessionId) await logoutUser(sessionId);

  res.clearCookie("sessionId", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });

  res.status(200).json(new ApiResponse(200, "Logout successful"));
};
