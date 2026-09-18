import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { ENV, type Env } from "../../config/env.schema";
import { ApiError } from "../http/api-response";
import { HEALTH_PATH } from "../http/routes";
import { RateLimiterService } from "./rate-limiter.service";

const GLOBAL_LIMIT_PER_MINUTE = { production: 120, other: 1000 } as const;

@Injectable() // Tell Nest to manage this guard through dependency injection.
export class ApiRateLimitGuard implements CanActivate {
  constructor(
    // Inject the service responsible for counting requests in Redis.
    private readonly limiter: RateLimiterService,

    // Inject validated environment settings so the limit can differ by environment.
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get the current HTTP request so we can inspect its route and client IP.
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    // Get the registered route path; fall back to the actual URL if Fastify has no route metadata.
    const route = request.routeOptions?.url ?? request.url.split("?")[0];

    // Don't rate-limit the health endpoint because monitoring systems may call it frequently.
    if (route === HEALTH_PATH) return true;

    // Use the stricter production limit and a more relaxed limit everywhere else.
    const limit =
      this.env.NODE_ENV === "production"
        ? GLOBAL_LIMIT_PER_MINUTE.production
        : GLOBAL_LIMIT_PER_MINUTE.other;

    // Ask Redis to increment this client's request counter within a 60-second window.
    // Example: `ip:102.89.34.12` → count 1, 2, 3... until the window expires.
    const result = await this.limiter.consume(`ip:${request.ip}`, limit, 60);

    if (!result.allowed) {
      // Get Fastify's response object so we can tell the client when it may retry.
      context
        .switchToHttp()
        .getResponse<FastifyReply>()

        // Example: `Retry-After: 42` means "try again in about 42 seconds."
        .header("retry-after", String(result.retryAfterSeconds));

      // Stop the request by throwing; AllExceptionsFilter turns this into the API's standard 429 response.
      // Example: HTTP 429 { success: false, statusCode: 429, message: "Too many requests..." }
      throw new ApiError(429, "Too many requests, please try again later.");
    }

    // Tell Nest the guard approves the request, so the controller can execute.
    return true;
  }
}
