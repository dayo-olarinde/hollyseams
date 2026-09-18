import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { ENV, type Env } from "../../config/env.schema";
import { ApiError } from "../../common/http/api-response";
import { REDIS, type RedisClient } from "../../redis/redis.module";
import { sessionKey } from "./auth.constants";
import { sessionSchema, type SessionDto } from "./session.schema";

@Injectable()
export class SessionStore {
  constructor(
    @Inject(REDIS) private readonly redis: RedisClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issue(userId: string): Promise<string> {
    const sessionId = randomUUID();
    const payload = sessionSchema.parse({ id: userId });

    await this.redis.set(
      sessionKey(sessionId),
      JSON.stringify(payload),
      "EX",
      this.env.SESSION_TTL_SECONDS,
    );

    return sessionId;
  }

  async read(sessionId: string): Promise<SessionDto> {
    const raw = await this.redis.get(sessionKey(sessionId));
    if (!raw) throw new ApiError(401, "Session expired");

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      await this.revoke(sessionId);
      throw new ApiError(401, "Invalid session");
    }

    const parsed = sessionSchema.safeParse(decoded);
    if (!parsed.success) {
      await this.revoke(sessionId);
      throw new ApiError(401, "Invalid session");
    }

    await this.refresh(sessionId);

    return parsed.data;
  }

  async refresh(sessionId: string): Promise<void> {
    await this.redis.expire(
      sessionKey(sessionId),
      this.env.SESSION_TTL_SECONDS,
    );
  }

  async revoke(sessionId: string): Promise<void> {
    await this.redis.del(sessionKey(sessionId));
  }
}
