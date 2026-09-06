import { logger } from "../config/logger";

/**
 * Register scheduled jobs (node-cron) here.
 *
 * Example:
 *   import cron from "node-cron";
 *   cron.schedule("0 0 * * *", async () => { ... });
 */
export const registerJobs = () => {
  logger.info("Scheduled jobs registered");
};
