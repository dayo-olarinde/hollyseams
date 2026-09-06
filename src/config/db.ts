import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "./env";
import { logger } from "./logger";
import * as schema from "../db/index";

const queryClient = postgres(env.DATABASE_URL, {
  max: env.DATABASE_MAX_CONNECTIONS,
  prepare: false,
  onnotice: () => {},
});

export const db = drizzle(queryClient, {
  schema,
  logger: env.NODE_ENV === "development",
});

// Raw SQL escape hatch (postgres-js tagged template).
export const pg = queryClient;

export const pingDb = async () => {
  await pg`SELECT 1`;
};

export const closeDb = async () => {
  logger.info("Closing database connection...");
  await queryClient.end();
};
