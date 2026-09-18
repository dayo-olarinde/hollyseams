import { Inject, Injectable } from "@nestjs/common";

import { ApiResponse } from "../../common/http/api-response";
import { PG_CLIENT, type PgClient } from "../../database/database.module";
import { REDIS, type RedisClient } from "../../redis/redis.module";

export interface HealthData {
  uptime: number;
  timestamp: string;
  checks: Record<string, string>;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(PG_CLIENT) private readonly pg: PgClient,
    @Inject(REDIS) private readonly redis: RedisClient,
  ) {}

  async check(): Promise<ApiResponse<HealthData>> {
    const checks: Record<string, string> = {};
    let healthy = true;

    try {
      await this.pg`SELECT 1`;
      checks.database = "up";
    } catch {
      checks.database = "down";
      healthy = false;
    }

    try {
      await this.redis.ping();
      checks.redis = "up";
    } catch {
      checks.redis = "down";
      healthy = false;
    }

    const statusCode = healthy ? 200 : 503;

    return new ApiResponse(statusCode, healthy ? "ok" : "degraded", {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks,
    });
  }
}
