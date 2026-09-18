import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { type NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module";
import { parseEnv, type Env } from "./config/env.schema";
import { PG_CLIENT, type PgClient } from "./database/database.module";
import { REDIS, type RedisClient } from "./redis/redis.module";
import { configureApp, createHttpAdapter } from "./setup-app";

const logger = new Logger("Bootstrap");

let env: Env;
try {
  env = parseEnv();
} catch (error) {
  logger.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const DEPENDENCY_RETRIES = 10;
const RETRY_DELAY_MS = 1000;

const waitForDependencies = async (
  app: NestFastifyApplication,
): Promise<void> => {
  for (let attempt = 1; attempt <= DEPENDENCY_RETRIES; attempt++) {
    try {
      const pg = app.get<PgClient>(PG_CLIENT);
      const redis = app.get<RedisClient>(REDIS);

      await pg`SELECT 1`;
      await redis.ping();

      logger.log("Dependencies are ready");
      return;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      logger.warn(
        `Waiting for dependencies... (attempt ${attempt}/${DEPENDENCY_RETRIES}: ${reason})`,
      );

      if (attempt < DEPENDENCY_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  throw new Error("Dependencies did not become ready in time");
};

const start = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createHttpAdapter(),
  );

  await configureApp(app);
  await waitForDependencies(app);
  app.enableShutdownHooks();

  await app.listen(env.PORT, "0.0.0.0");
  logger.log(`Server listening on port ${env.PORT}`);
};

process.on("uncaughtException", (error) => {
  logger.fatal(`Uncaught exception: ${error.stack ?? error.message}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error(
    `Unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`,
  );
});

start().catch((error: unknown) => {
  logger.fatal(
    `Failed to start server: ${error instanceof Error ? error.stack : String(error)}`,
  );
  process.exit(1);
});
