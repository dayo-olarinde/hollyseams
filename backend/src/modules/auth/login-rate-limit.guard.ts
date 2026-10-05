import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ApiError } from "../../common/http/api-response";
import { RateLimiterService } from "../../common/rate-limit/rate-limiter.service";
import { LOGIN_LOCKOUT, LOGIN_RATE_LIMIT } from "./auth.constants";
import { LoginAttemptsService } from "./login-attempts.service";

/**
 * Pre-checks for POST /auth/login — the first half of the numbered flow in
 * auth.controller.ts. Two independent stops, in this order:
 *
 *   Step 2 — fixed window (all attempts, 5 / 15 min). Checked first so "limit spent"
 *            always answers with the stable, documented window message.
 *   Step 3 — lockout (armed by wrong PINs, exponential delay). Rejected while the lock
 *            key lives AND the window still has budget (e.g. the attempt right after
 *            the lock was armed); once the window is spent its message wins instead.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(
    private readonly limiter: RateLimiterService,
    private readonly attempts: LoginAttemptsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    // Step 2: fixed window — Redis INCR per attempt, global key (single-user app).
    const result = await this.limiter.consume(
      LOGIN_RATE_LIMIT.key,
      LOGIN_RATE_LIMIT.limit,
      LOGIN_RATE_LIMIT.windowMinutes * 60,
    );

    if (!result.allowed) {
      reply.header("retry-after", String(result.retryAfterSeconds));
      throw new ApiError(429, LOGIN_RATE_LIMIT.message);
    }

    // Step 3: lockout — while the lock key lives, the PIN is never even checked, so a
    // locked account gives an attacker no timing or 401/429 signal to work with.
    const lock = await this.attempts.currentLock();

    if (lock.locked) {
      reply.header("retry-after", String(lock.retryAfterSeconds));
      throw new ApiError(429, LOGIN_LOCKOUT.message);
    }

    return true;
  }
}
