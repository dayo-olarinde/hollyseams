/**
 * Deterministic environment loaded before test imports.
 *
 * Express bridge: tests used to depend on whatever `.env` or shell variables were
 * present. Vitest runs this setup file first, so `AppModule` sees known values instead.
 * The database and Redis providers are then overridden with fakes; this file opens no
 * connections.
 */
process.env.NODE_ENV = "test";
process.env.PORT = "7001";

process.env.FRONTEND_URL ??= "http://localhost:3000";
process.env.SEED_PIN ??= "1234";
process.env.PEPPER ??= "test-pepper";
process.env.SESSION_TTL_SECONDS ??= "604800";

process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/hollyseams_test";
process.env.DATABASE_MAX_CONNECTIONS ??= "1";
process.env.REDIS_URL ??= "redis://localhost:6379";

process.env.CLOUDINARY_CLOUD_NAME ??= "test-cloud";
process.env.CLOUDINARY_API_KEY ??= "test-key";
process.env.CLOUDINARY_API_SECRET ??= "test-secret";
// Forced, not `??=`: tests assert the upload folder exactly (the signature payload and the
// `startsWith` folder check both read it), so a developer's `.env` must not change the result.
process.env.CLOUDINARY_UPLOAD_FOLDER = "hollyseams/photos";
