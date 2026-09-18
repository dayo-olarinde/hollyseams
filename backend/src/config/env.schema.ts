import { z } from "zod";

export const envSchema = z.object({
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

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol("ENV");

let cached: Env | undefined;

export const parseEnv = (raw: NodeJS.ProcessEnv = process.env): Env => {
  if (cached) return cached;

  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
      )
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }

  cached = result.data;
  return cached;
};
