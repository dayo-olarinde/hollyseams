import type { FastifyRequest } from "fastify";
import type { Env } from "../../config/env.schema";

export interface SessionCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict";
  path: string;
  maxAge?: number;
}

const isSecureRequest = (request: FastifyRequest, env: Env): boolean =>
  env.NODE_ENV === "production" || request.protocol === "https";

const baseCookieOptions = (
  request: FastifyRequest,
  env: Env,
): Omit<SessionCookieOptions, "maxAge"> => ({
  httpOnly: true,
  secure: isSecureRequest(request, env),
  sameSite: "strict",
  path: "/",
});

export const sessionCookieOptions = (
  request: FastifyRequest,
  env: Env,
): SessionCookieOptions => ({
  ...baseCookieOptions(request, env),
  maxAge: env.SESSION_TTL_SECONDS,
});

export const clearSessionCookieOptions = (
  request: FastifyRequest,
  env: Env,
): SessionCookieOptions => baseCookieOptions(request, env);
