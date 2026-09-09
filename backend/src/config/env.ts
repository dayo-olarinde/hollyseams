import "dotenv/config";
import { z } from "zod";
import { logger } from "./logger";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(7000),
  BASE_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),

  SEED_PIN: z.string(),
  PEPPER: z.string(),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),

  DATABASE_URL: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().positive().default(5),

  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  CLOUDINARY_URL: z.string(),
  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),
  // Folder signed uploads land in; the backend verifies every persisted
  // photo lives under this prefix before it is attached to a job.
  CLOUDINARY_UPLOAD_FOLDER: z.string().default("hollyseams/photos"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  logger.error(
    { errors: result.error.format() },
    "Invalid environment variables",
  );
  process.exit(1);
}

export const env = result.data;
