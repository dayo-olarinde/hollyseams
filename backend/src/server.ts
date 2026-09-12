import { app } from "./app";
import { closeDb, pingDb } from "./config/db";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { redis } from "./config/redis";

const waitForDependencies = async (): Promise<void> => {
  const retries = 10;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pingDb();
      await redis.ping();
      logger.info("Dependencies ready");
      return;
    } catch (err) {
      logger.warn(
        { attempt, retries, err },
        "Waiting for dependencies to be ready...",
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Dependencies did not become ready in time");
};

const start = async () => {
  await waitForDependencies();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      try {
        await redis.quit();
        await closeDb();
        logger.info("Server closed");
        process.exit(0);
      } catch (err) {
        logger.error(err, "Error during shutdown");
        process.exit(1);
      }
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

process.on("uncaughtException", (err) => {
  logger.fatal(err, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
});

start().catch((err) => {
  logger.fatal(err, "Failed to start server");
  process.exit(1);
});
