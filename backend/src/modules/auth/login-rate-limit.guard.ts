import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ApiError } from "../../common/http/api-response";
import { RateLimiterService } from "../../common/rate-limit/rate-limiter.service";
import { LOGIN_RATE_LIMIT } from "./auth.constants";

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RateLimiterService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = await this.limiter.consume(
      LOGIN_RATE_LIMIT.key,
      LOGIN_RATE_LIMIT.limit,
      LOGIN_RATE_LIMIT.windowMinutes * 60,
    );

    if (!result.allowed) {
      context
        .switchToHttp()
        .getResponse<FastifyReply>()
        .header("retry-after", String(result.retryAfterSeconds));
      throw new ApiError(429, LOGIN_RATE_LIMIT.message);
    }

    return true;
  }
}
