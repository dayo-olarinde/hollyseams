import { describe, expect, it } from "vitest";
import { ApiError } from "../src/common/http/api-response";
import { AuthService } from "../src/modules/auth/auth.service";
import { LoginAttemptsService } from "../src/modules/auth/login-attempts.service";
import { SessionStore } from "../src/modules/auth/session.store";
import type { PinHasherService } from "../src/modules/auth/pin-hasher.service";
import type { Env } from "../src/config/env.schema";
import { FakeRedis, fakeDatabase } from "./helpers/fakes";

/**
 * Unit tests for auth providers without starting Nest.
 *
 * Direct construction is appropriate here: these tests target class behavior, not module
 * wiring. Constructor injection still provides the seam, so fake database, Redis, and
 * hashing dependencies replace real infrastructure. `auth.http.test.ts` uses
 * `TestingModule` when the Nest request pipeline itself is under test.
 */

const testEnv = {
  NODE_ENV: "test",
  SESSION_TTL_SECONDS: 604800,
  PEPPER: "test-pepper",
} as unknown as Env;

const USER_ID = "3f1c2b1a-9d4e-4f6a-8b2c-1d2e3f4a5b6c";
const PIN_HASH = "argon2-hash";

/** Deterministic hasher double: it accepts one PIN without running Argon2. */
const fakeHasher = (validPin: string): PinHasherService =>
  ({
    verifyPin: (pin: string) => Promise.resolve(pin === validPin),
    hashPin: () => Promise.resolve(PIN_HASH),
    dummyVerify: () => Promise.resolve(true),
  }) as unknown as PinHasherService;

describe("SessionStore.issue", () => {
  it("stores the payload under session:<id> with the configured TTL and a random id", async () => {
    const redis = new FakeRedis();
    const store = new SessionStore(redis.asClient(), testEnv);

    const sessionId = await store.issue(USER_ID);

    // The write includes the expiry, so a session cannot persist indefinitely.
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(redis.store.get(`session:${sessionId}`)).toBe(
      JSON.stringify({ id: USER_ID }),
    );
    expect(redis.calls).toContain(`set:session:${sessionId}:EX:604800`);
  });
});

describe("SessionStore.read", () => {
  it("returns the payload and refreshes the TTL for a valid session", async () => {
    const redis = new FakeRedis({
      seed: { "session:abc": JSON.stringify({ id: USER_ID }) },
    });
    const store = new SessionStore(redis.asClient(), testEnv);

    const session = await store.read("abc");

    expect(session).toEqual({ id: USER_ID });
    // Each authenticated read extends the session: a sliding expiration window.
    expect(redis.calls).toContain("expire:session:abc:604800");
  });

  it("throws 401 'Session expired' when the key is missing", async () => {
    const store = new SessionStore(new FakeRedis().asClient(), testEnv);

    await expect(store.read("missing")).rejects.toMatchObject({
      statusCode: 401,
      message: "Session expired",
    });
  });

  it("revokes and throws 401 'Invalid session' when the stored payload is not JSON", async () => {
    const redis = new FakeRedis({ seed: { "session:bad": "not-json" } });
    const store = new SessionStore(redis.asClient(), testEnv);

    await expect(store.read("bad")).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid session",
    });
    // Invalid data is revoked instead of failing repeatedly on every request.
    expect(redis.store.has("session:bad")).toBe(false);
  });

  it("revokes and throws 401 'Invalid session' when the payload fails the schema", async () => {
    const redis = new FakeRedis({
      seed: { "session:wrong": JSON.stringify({ id: "not-a-uuid" }) },
    });
    const store = new SessionStore(redis.asClient(), testEnv);

    await expect(store.read("wrong")).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid session",
    });
    expect(redis.store.has("session:wrong")).toBe(false);
  });
});

describe("AuthService.login", () => {
  it("returns a session id for the correct PIN", async () => {
    const redis = new FakeRedis();
    const service = new AuthService(
      fakeDatabase([{ id: USER_ID, pinHash: PIN_HASH }]),
      fakeHasher("1234"),
      new SessionStore(redis.asClient(), testEnv),
      new LoginAttemptsService(redis.asClient()),
    );

    const sessionId = await service.login("1234");

    expect(redis.store.has(`session:${sessionId}`)).toBe(true);
  });

  it("throws 401 with the same message for a wrong PIN", async () => {
    const redis = new FakeRedis();
    const service = new AuthService(
      fakeDatabase([{ id: USER_ID, pinHash: PIN_HASH }]),
      fakeHasher("1234"),
      new SessionStore(redis.asClient(), testEnv),
      new LoginAttemptsService(redis.asClient()),
    );

    await expect(service.login("9999")).rejects.toMatchObject({
      statusCode: 401,
      message: "Incorrect PIN. Try again.",
    });
    // A wrong PIN must leave a trace: the failure streak feeds the lockout.
    expect(redis.store.get("ratelimit:login:fail")).toBe("1");
  });

  it("throws the SAME 401 when no user row exists (no account enumeration)", async () => {
    const redis = new FakeRedis();
    const service = new AuthService(
      fakeDatabase([]),
      fakeHasher("1234"),
      new SessionStore(redis.asClient(), testEnv),
      new LoginAttemptsService(redis.asClient()),
    );

    await expect(service.login("1234")).rejects.toMatchObject({
      statusCode: 401,
      message: "Incorrect PIN. Try again.",
    });
    // Even the no-user path counts as a failure — same message, same consequences.
    expect(redis.store.get("ratelimit:login:fail")).toBe("1");
  });

  it("throws ApiError instances (so the global filter can render them)", async () => {
    const redis = new FakeRedis();
    const service = new AuthService(
      fakeDatabase([]),
      fakeHasher("1234"),
      new SessionStore(redis.asClient(), testEnv),
      new LoginAttemptsService(redis.asClient()),
    );

    await expect(service.login("1234")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("LoginAttemptsService.recordFailure", () => {
  it("arms an exponentially longer lock from the threshold, caps it, and resets", async () => {
    const redis = new FakeRedis();
    const service = new LoginAttemptsService(redis.asClient());

    // Failures 1–3 stay below the threshold: no lock, typos cost nothing.
    await service.recordFailure();
    await service.recordFailure();
    await service.recordFailure();
    expect(await service.currentLock()).toEqual({
      locked: false,
      retryAfterSeconds: 0,
    });

    // Failure 4 (the threshold): first lock = base 30 s.
    await service.recordFailure();
    expect(redis.expiries.get("ratelimit:login:lock")).toBe(30);
    expect((await service.currentLock()).locked).toBe(true);

    // Each further failure doubles the delay.
    await service.recordFailure();
    expect(redis.expiries.get("ratelimit:login:lock")).toBe(60);
    await service.recordFailure();
    expect(redis.expiries.get("ratelimit:login:lock")).toBe(120);

    // Run the streak up to the ceiling: 30 * 2^(fails - 4) would exceed 1 h at
    // failure 11, so the cap pins it at 3600 no matter how far the attacker goes.
    for (let fails = 7; fails <= 12; fails++) await service.recordFailure();
    expect(redis.expiries.get("ratelimit:login:lock")).toBe(3600);

    // A correct PIN wipes streak and lock: the owner is back in charge.
    await service.reset();
    expect(redis.store.has("ratelimit:login:fail")).toBe(false);
    expect(redis.store.has("ratelimit:login:lock")).toBe(false);
    expect(await service.currentLock()).toEqual({
      locked: false,
      retryAfterSeconds: 0,
    });
  });
});
