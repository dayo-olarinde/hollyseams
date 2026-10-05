import { Inject, Injectable } from "@nestjs/common";
import { REDIS, type RedisClient } from "../../redis/redis.module";
import { LOGIN_LOCKOUT } from "./auth.constants";

/**
 * Failure streak + exponential lockout for the login PIN.
 *
 * Three Redis keys, all global because the app is single-user:
 *   ratelimit:login       — fixed window, counted by LoginRateLimitGuard (not here)
 *   ratelimit:login:fail  — consecutive wrong-PIN count, lives `failWindowSeconds`
 *   ratelimit:login:lock  — exists only while locked; its TTL IS the remaining delay
 *
 * Flow (numbers continue auth.controller's login map):
 *   3.  guard asks `currentLock()` before the PIN is checked → 429 while locked
 *   5c. wrong PIN → `recordFailure()` → at the threshold, arm the lock:
 *       baseSeconds * 2^(fails - threshold), capped at maxSeconds
 *   5d. correct PIN → `reset()` wipes streak + lock
 */
@Injectable()
export class LoginAttemptsService {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  /** Step 3 — is login currently frozen? TTL > 0 means "still locked". */
  async currentLock(): Promise<{ locked: boolean; retryAfterSeconds: number }> {
    // Real Redis answers -2 (missing) / -1 (no TTL); both mean "not locked", so > 0
    // is the only check — and it doubles as the Retry-After the client should wait.
    const ttl = await this.redis.ttl(`ratelimit:${LOGIN_LOCKOUT.lockKey}`);

    return ttl > 0
      ? { locked: true, retryAfterSeconds: ttl }
      : { locked: false, retryAfterSeconds: 0 };
  }

  /** Step 5c — record one wrong PIN; arm (or re-arm, at double the delay) the lock. */
  async recordFailure(): Promise<void> {
    const failKey = `ratelimit:${LOGIN_LOCKOUT.failKey}`;

    // INCR is atomic, so concurrent guesses can't both see "threshold - 1".
    const fails = await this.redis.incr(failKey);

    // Start the streak's lifetime on the first failure only (INCR-then-EXPIRE, the same
    // fixed-window pattern RateLimiterService uses). Deliberately 60 min — long enough
    // to survive across several 15-min attempt windows so the delay can escalate.
    if (fails === 1) await this.redis.expire(failKey, LOGIN_LOCKOUT.failWindowSeconds);

    if (fails < LOGIN_LOCKOUT.threshold) return;

    const lockSeconds = Math.min(
      LOGIN_LOCKOUT.maxSeconds,
      LOGIN_LOCKOUT.baseSeconds * 2 ** (fails - LOGIN_LOCKOUT.threshold),
    );

    // "EX" writes value + TTL in one command: a crash between SET and EXPIRE would leave
    // a lock with no TTL — a permanent lockout on the only account.
    await this.redis.set(
      `ratelimit:${LOGIN_LOCKOUT.lockKey}`,
      String(lockSeconds),
      "EX",
      lockSeconds,
    );
  }

  /** Step 5d — the owner is in: a good PIN erases every trace of the bad tries. */
  async reset(): Promise<void> {
    await this.redis.del(`ratelimit:${LOGIN_LOCKOUT.failKey}`);
    await this.redis.del(`ratelimit:${LOGIN_LOCKOUT.lockKey}`);
  }
}