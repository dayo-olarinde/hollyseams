import { Inject, Injectable } from "@nestjs/common";
import { REDIS, type RedisClient } from "../../redis/redis.module";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

@Injectable()
export class RateLimiterService {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${key}`;
    const count = await this.redis.incr(redisKey);

    // TTL set only on the first request so every attempt shares one fixed window
    // deadline; refreshing it per request would slide the window for heavy clients.
    if (count === 1) await this.redis.expire(redisKey, windowSeconds);

    // A missing key or one without a TTL answers -2/-1, which would tell clients to
    // wait forever — fall back to the configured window instead.
    const ttl = await this.redis.ttl(redisKey);

    return {
      allowed: count <= limit,
      retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }

  async reset(key: string): Promise<void> {
    // Cleared after a successful login so earlier failures don't linger into the next visit.
    await this.redis.del(`ratelimit:${key}`);
  }
}
