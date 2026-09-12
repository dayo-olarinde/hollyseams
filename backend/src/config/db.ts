import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/index";
import { env } from "./env";
import { logger } from "./logger";

const queryClient = postgres(env.DATABASE_URL, {
  max: env.DATABASE_MAX_CONNECTIONS,
  prepare: true,
  onnotice: () => {},
});

export const db = drizzle(queryClient, {
  schema,
  logger: env.NODE_ENV === "development",
});

export const pg = queryClient;

export const pingDb = async () => {
  await pg`SELECT 1`;
};

export const closeDb = async () => {
  logger.info("Closing database connection...");
  await queryClient.end();
};
