import { Inject, Injectable } from "@nestjs/common";
import { REDIS, type RedisClient } from "../../redis/redis.module";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

@Injectable() // Tell Nest to manage this service through dependency injection.
export class RateLimiterService {
  // Inject the shared Redis client so this service can store and count request attempts.
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  async consume(
    key: string, // Identifies who/what is being rate-limited, e.g. `ip:102.89.34.12`.
    limit: number, // Maximum number of allowed requests within the window.
    windowSeconds: number, // How long the rate-limit window lasts, e.g. 60 seconds.
  ): Promise<RateLimitResult> {
    // Build the Redis key so rate-limit keys are separated from other Redis data.
    // Example: `ratelimit:ip:102.89.34.12`.
    const redisKey = `ratelimit:${key}`;

    // Atomically increment the number of requests made for this key.
    // Example: first request → 1, second → 2, third → 3.
    const count = await this.redis.incr(redisKey);

    // Only the first request creates the expiration timer for this rate-limit window.
    // Example: first request → key expires in 60s; later requests keep that same deadline.
    if (count === 1) await this.redis.expire(redisKey, windowSeconds);

    // Ask Redis how many seconds remain before this rate-limit key disappears.
    // Example: 47 means the current window has about 47 seconds remaining.
    const ttl = await this.redis.ttl(redisKey);

    return {
      // Allow the request only while the number of attempts is within the configured limit.
      // Example: limit = 5 → counts 1–5 allowed, count 6+ rejected.
      allowed: count <= limit,

      // Tell the caller how long the client should wait before the current window resets.
      // If Redis gives no valid TTL, fall back to the configured window length.
      retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }

  async reset(key: string): Promise<void> {
    // Delete the counter so the next request starts a completely new rate-limit window.
    // Used after something like a successful login so failed-login attempts don't linger.
    await this.redis.del(`ratelimit:${key}`);
  }
}
