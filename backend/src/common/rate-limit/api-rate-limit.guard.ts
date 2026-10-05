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

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  constructor(
    private readonly limiter: RateLimiterService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const route = request.routeOptions?.url ?? request.url.split("?")[0];

    // Health probes are polled by monitors; throttling them would page someone.
    if (route === HEALTH_PATH) return true;

    const limit =
      this.env.NODE_ENV === "production"
        ? GLOBAL_LIMIT_PER_MINUTE.production
        : GLOBAL_LIMIT_PER_MINUTE.other;

    const result = await this.limiter.consume(`ip:${request.ip}`, limit, 60);

    if (!result.allowed) {
      context
        .switchToHttp()
        .getResponse<FastifyReply>()
        .header("retry-after", String(result.retryAfterSeconds));

      // Thrown → AllExceptionsFilter renders the API's standard 429 envelope.
      throw new ApiError(429, "Too many requests, please try again later.");
    }

    return true;
  }
}
