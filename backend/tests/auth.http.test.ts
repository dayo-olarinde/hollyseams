import { Test } from "@nestjs/testing";
import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { DRIZZLE, PG_CLIENT } from "../src/database/database.module";
import { PhotoCleanupService } from "../src/media/photo-cleanup.service";
import { configureApp, createHttpAdapter } from "../src/setup-app";
import { PinHasherService } from "../src/modules/auth/pin-hasher.service";
import { REDIS } from "../src/redis/redis.module";
import {
  FakeRedis,
  fakeDatabase,
  fakePgClient,
  fakePhotoCleanup,
} from "./helpers/fakes";

/**
 * In-process HTTP tests for the auth endpoints.
 *
 * `Test.createTestingModule(...)` builds Nest's module and DI graph, not a listening
 * server. `overrideProvider(...).useValue(...)` swaps dependencies before construction,
 * replacing Express-style import mocking with explicit DI substitution.
 *
 * `app.inject()` is Fastify's in-process request helper. It runs the real Nest pipeline
 * (global guard, route guard, pipe, controller, interceptor, and filter) without a port
 * or network. The assertions protect the response contract shared with the Express app.
 */
const SEED_PIN = "1234";
const USER_ID = "3f1c2b1a-9d4e-4f6a-8b2c-1d2e3f4a5b6c";
const SESSION_ID = "test-session";

/**
 * Argon2 is replaced here because its memory cost makes repeated route tests slow. These
 * tests prove wiring and HTTP behavior; the real hasher is verified separately. DI makes
 * the substitution explicit instead of requiring Express-style import mocking.
 */
const fakePinHasher = {
  verifyPin: (pin: string) => Promise.resolve(pin === SEED_PIN),
  hashPin: () => Promise.resolve("fake-hash"),
  dummyVerify: () => Promise.resolve(true),
};

describe("auth endpoints (HTTP)", () => {
  let app: NestFastifyApplication;
  let redis: FakeRedis;

  beforeEach(async () => {
    redis = new FakeRedis();

    // AppModule already owns the global filter, interceptor, pipe, and guard. Re-declaring
    // them here would create a different provider context and can break DI resolution.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Replace external resources before Nest constructs their real providers.
      .overrideProvider(REDIS)
      .useValue(redis)
      .overrideProvider(DRIZZLE)
      .useValue(fakeDatabase([{ id: USER_ID, pinHash: "unused-by-the-fake" }]))
      .overrideProvider(PG_CLIENT)
      .useValue(fakePgClient())
      .overrideProvider(PinHasherService)
      .useValue(fakePinHasher)
      // The global photo cleanup queue dials Redis the moment it is constructed.
      .overrideProvider(PhotoCleanupService)
      .useValue(fakePhotoCleanup().service)
      .compile();

    // Use the same adapter options, plugins, and prefix as production; otherwise this is a
    // different application and cookie/routing behavior is not under test.
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      createHttpAdapter(),
      { logger: false },
    );
    await configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const login = (payload: unknown) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "content-type": "application/json" },
      payload: typeof payload === "string" ? payload : JSON.stringify(payload),
    });

  const logout = (sessionId?: string) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      ...(sessionId ? { cookies: { sessionId } } : {}),
    });

  const getSession = (sessionId?: string) =>
    app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      ...(sessionId ? { cookies: { sessionId } } : {}),
    });

  it("answers GET /auth/session only for a live session", async () => {
    redis.store.set(
      `session:${SESSION_ID}`,
      JSON.stringify({ id: USER_ID }),
    );

    const signedIn = await getSession(SESSION_ID);
    const anonymous = await getSession();
    const revoked = await getSession("a-session-that-was-revoked");

    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.json().message).toBe("Session active");
    // No payload: the client only needs "yes" or "no", so there is nothing to leak.
    expect(signedIn.json().data).toBeUndefined();
    expect(anonymous.statusCode).toBe(401);
    expect(revoked.statusCode).toBe(401);
  });

  it("stops answering GET /auth/session after logout", async () => {
    redis.store.set(
      `session:${SESSION_ID}`,
      JSON.stringify({ id: USER_ID }),
    );

    expect((await getSession(SESSION_ID)).statusCode).toBe(200);
    await logout(SESSION_ID);
    expect((await getSession(SESSION_ID)).statusCode).toBe(401);
  });

  it("answers GET /health with 200 and the dependency checks", async () => {
    // Exercise the root probe route through the complete Nest/Fastify pipeline.
    const response = await app.inject({ method: "GET", url: "/health" });

    // Health is intentionally outside the versioned API prefix.
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.checks).toEqual({ database: "up", redis: "up" });
  });

  it("answers 503 with 'degraded' when a dependency is down", async () => {
    // Build a second app whose injected Postgres client reports a failure.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REDIS)
      .useValue(redis)
      .overrideProvider(DRIZZLE)
      .useValue(fakeDatabase([]))
      .overrideProvider(PG_CLIENT)
      .useValue(fakePgClient({ failPing: true }))
      .overrideProvider(PhotoCleanupService)
      .useValue(fakePhotoCleanup().service)
      .compile();
    const degradedApp =
      moduleRef.createNestApplication<NestFastifyApplication>(
        createHttpAdapter(),
        { logger: false },
      );
    await configureApp(degradedApp);
    await degradedApp.init();

    // The injected Postgres double now fails its readiness query.
    const response = await degradedApp.inject({ method: "GET", url: "/health" });

    // The interceptor copies the envelope status to the Fastify response.
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      success: false,
      statusCode: 503,
      message: "degraded",
      data: { checks: { database: "down", redis: "up" } },
    });

    await degradedApp.close();
  });

  it("keeps /health outside the global rate limit", async () => {
    // Exhaust the API counter, then compare a protected API route with the probe route.
    redis.store.set("ratelimit:ip:127.0.0.1", "1000");

    // Compare an API request, which is limited, with the exempt health probe.
    const limited = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
    });
    const health = await app.inject({ method: "GET", url: "/health" });

    expect(limited.statusCode).toBe(429);
    expect(health.statusCode).toBe(200);
  });

  it("returns 400 with field errors when the PIN format is invalid", async () => {
    // The guard allows this attempt; the parameter pipe rejects the body.
    const response = await login({ pin: "abc" });

    // This is the error shape consumed by the frontend transport.
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      statusCode: 400,
      message: "Validation failed",
      errors: [{ field: "pin", message: "PIN must be exactly 4 digits" }],
    });
  });

  it("rejects unknown keys, because the schema is strict", async () => {
    const response = await login({ pin: SEED_PIN, admin: true });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { field: "", message: 'Unrecognized key: "admin"' },
    ]);
  });

  it("returns 200, sets the 7-day httpOnly session cookie, and resets the limiter on success", async () => {
    // Failed attempts consume the login counter before the successful attempt.
    await Promise.all([
      login({ pin: "0000" }),
      login({ pin: "0000" }),
      login({ pin: "0000" }),
    ]);

    // The valid attempt should still pass and reset the counter.
    const response = await login({ pin: SEED_PIN });

    // Success envelope.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      statusCode: 200,
      message: "Login successful",
      success: true,
    });

    const cookie = String(response.headers["set-cookie"]);
    expect(cookie).toContain("sessionId=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    // Fastify uses seconds for `maxAge`; unlike Express, it does not expect milliseconds.
    expect(cookie).toContain("Max-Age=604800");
    // Tests use plain HTTP, so the cookie is not marked Secure.
    expect(cookie).not.toContain("Secure");

    // The cookie holds only the opaque id; the session data lives in Redis.
    const sessionId = /sessionId=([^;]+)/.exec(cookie)?.[1];
    expect(sessionId).toBeDefined();
    expect(redis.store.has(`session:${sessionId}`)).toBe(true);

    // A successful login clears the counter, so earlier typos cannot lock out the owner —
    // and it wipes the failure streak feeding the lockout (steps 5d/6 of the flow).
    expect(redis.store.has("ratelimit:login")).toBe(false);
    expect(redis.store.has("ratelimit:login:fail")).toBe(false);
    expect(redis.store.has("ratelimit:login:lock")).toBe(false);
  });

  it("returns 401 with the preserved message for a wrong PIN", async () => {
    const response = await login({ pin: "9999" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      statusCode: 401,
      message: "Incorrect PIN. Try again.",
    });
  });

  it("returns 401 'Not authenticated' for logout without a session cookie", async () => {
    const response = await logout();

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe("Not authenticated");
  });

  it("returns 401 'Session expired' for a session that is not in the store", async () => {
    const response = await logout("6c1f9f0e-0000-4000-8000-000000000000");

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe("Session expired");
  });

  it("returns 401 'Invalid session' and revokes a payload that fails the schema", async () => {
    // Seed a session token whose server-side payload fails validation.
    redis.store.set("session:tampered", JSON.stringify({ id: "not-a-uuid" }));

    const response = await logout("tampered");

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe("Invalid session");
    expect(redis.store.has("session:tampered")).toBe(false);
  });

  it("refreshes the session TTL on an authenticated request", async () => {
    // Seed a valid session, then use it on a protected request.
    redis.store.set("session:valid", JSON.stringify({ id: USER_ID }));

    await logout("valid");

    // Reading a session refreshes its TTL: this is a sliding expiration window.
    expect(redis.calls).toContain("expire:session:valid:604800");
  });

  it("returns 200 'Logout successful' and clears the cookie for a valid session", async () => {
    redis.store.set("session:valid", JSON.stringify({ id: USER_ID }));

    const response = await logout("valid");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      statusCode: 200,
      message: "Logout successful",
    });
    expect(String(response.headers["set-cookie"])).toContain("sessionId=");
    expect(redis.store.has("session:valid")).toBe(false);
  });

  it("returns 404 with the legacy wording for an unknown route", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      success: false,
      statusCode: 404,
      message: "The resource /api/v1/nope was not found",
    });
  });

  it("routes malformed JSON through the same error envelope (Fastify parser errors)", async () => {
    const response = await login('{"pin":');

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(400);
    // Fastify's parser error still passes through the application's single error envelope.
    expect(body.message).toContain("not valid JSON");
  });

  it("answers 429 with the preserved message once the login limit is spent", async () => {
    // Five failures spend the fixed login window; the sixth is rejected by the guard.
    for (let attempt = 0; attempt < 5; attempt++) await login({ pin: "0000" });

    const response = await login({ pin: "0000" });

    expect(response.statusCode).toBe(429);
    expect(response.json().message).toBe(
      "Too many login attempts. Wait 15 minutes.",
    );
    expect(response.headers["retry-after"]).toBeDefined();
  });

  it("locks login with exponential backoff after the threshold and clears on success", async () => {
    // Window 1: three typos are free; the fourth (the threshold) arms the first lock.
    for (let attempt = 0; attempt < 4; attempt++) await login({ pin: "0000" });
    expect(redis.expiries.get("ratelimit:login:lock")).toBe(30);

    // Still inside window 1: even the CORRECT PIN is refused — step 3 answers before
    // the PIN is ever checked, so a locked account leaks nothing to the attacker.
    const locked = await login({ pin: SEED_PIN });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().message).toBe(
      "Too many incorrect PINs. Login is temporarily locked.",
    );
    expect(locked.headers["retry-after"]).toBeDefined();

    // Time passes: the attempt window and the 30 s lock lapse, but the 60-minute
    // failure streak survives — so the next wrong PIN escalates the lock to 60 s.
    await redis.del("ratelimit:login");
    await redis.del("ratelimit:login:lock");
    await login({ pin: "0000" });
    expect(redis.expiries.get("ratelimit:login:lock")).toBe(60);

    // The doubled lock answers again while the fresh window still has budget.
    expect((await login({ pin: SEED_PIN })).statusCode).toBe(429);

    // Once the lock expires the owner gets in, and success wipes the whole trail.
    await redis.del("ratelimit:login:lock");
    const success = await login({ pin: SEED_PIN });

    expect(success.statusCode).toBe(200);
    expect(redis.store.has("ratelimit:login")).toBe(false);
    expect(redis.store.has("ratelimit:login:fail")).toBe(false);
    expect(redis.store.has("ratelimit:login:lock")).toBe(false);
  });
});
