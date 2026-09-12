import "dotenv/config";
import { z } from "zod";
import { logger } from "./logger";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(7000),

  FRONTEND_URL: z.string().url(),

  SEED_PIN: z.string(),
  PEPPER: z.string(),

  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),

  DATABASE_URL: z.string().min(1),

  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().positive().default(5),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),

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
