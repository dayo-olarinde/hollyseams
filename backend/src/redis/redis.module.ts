import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import Redis from "ioredis";

import { ENV, type Env } from "../config/env.schema";

export const REDIS = Symbol("REDIS");

export type RedisClient = Redis;

const createClient = (env: Env): RedisClient => {
  const logger = new Logger("Redis");

  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keyPrefix: "hollyseams:",
  });

  client.on("connect", () => logger.log("Redis connected"));
  client.on("error", (err: Error) => logger.error("Redis error", { err }));

  return client;
};

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (env: Env) => createClient(env),
      inject: [ENV],
    },
  ],

  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
