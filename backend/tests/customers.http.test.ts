import { Test } from "@nestjs/testing";
import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { DRIZZLE, PG_CLIENT } from "../src/database/database.module";
import { PhotoCleanupService } from "../src/media/photo-cleanup.service";
import { REDIS } from "../src/redis/redis.module";
import { configureApp, createHttpAdapter } from "../src/setup-app";
import {
  FakeRedis,
  fakePgClient,
  fakePhotoCleanup,
  fakeQueryDb,
  type FakeDbHandle,
  type FakeDbOptions,
} from "./helpers/fakes";

/**
 * In-process HTTP tests for the customers endpoints.
 *
 * `TestingModule` builds the real module and DI graph, so these tests exercise the actual
 * request pipeline: the global rate-limit guard, the controller-level `SessionGuard`, the
 * pipes attached to `@Param`/`@Query`/`@Body`, the controller, the service, the response
 * interceptor, and the exception filter. Only the database and Redis are replaced.
 *
 * Express bridge: the old tests needed a live Postgres or a mocked module. `overrideProvider`
 * swaps a provider *inside* the graph, so the code under test is the production wiring.
 *
 * The assertions protect the response contract the frontend reads: the envelope fields, the
 * `meta.nextCursor` value, and the exact validation messages.
 */
const USER_ID = "3f1c2b1a-9d4e-4f6a-8b2c-1d2e3f4a5b6c";
const SESSION_ID = "test-session";
const CUSTOMER_ID = "5596e755-1c3b-4559-b22f-2b502d0a1cb7";

const customerRow = (name: string, id: string, phoneNumber: string | null = null) => ({
  id,
  name,
  phoneNumber,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

let app: NestFastifyApplication | undefined;

/**
 * Build the application around a canned database.
 *
 * The Redis double is seeded with one valid session, so every request can authenticate as
 * the owner without going through login — that path is covered by `auth.http.test.ts`.
 */
const buildApp = async (
  options: FakeDbOptions = {},
): Promise<{ db: FakeDbHandle; redis: FakeRedis }> => {
  const db = fakeQueryDb(options);
  const redis = new FakeRedis({
    seed: { [`session:${SESSION_ID}`]: JSON.stringify({ id: USER_ID }) },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(REDIS)
    .useValue(redis)
    .overrideProvider(DRIZZLE)
    .useValue(db.db)
    .overrideProvider(PG_CLIENT)
    .useValue(fakePgClient())
    // The global photo cleanup queue dials Redis the moment it is constructed.
    .overrideProvider(PhotoCleanupService)
    .useValue(fakePhotoCleanup().service)
    .compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(
    createHttpAdapter(),
    { logger: false },
  );
  await configureApp(app);
  await app.init();

  return { db, redis };
};

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** All requests carry the seeded session cookie unless a test deliberately omits it. */
const get = (url: string, session = true) =>
  app!.inject({
    method: "GET",
    url,
    ...(session ? { cookies: { sessionId: SESSION_ID } } : {}),
  });

const send = (method: "POST" | "PATCH", url: string, payload: unknown) =>
  app!.inject({
    method,
    url,
    cookies: { sessionId: SESSION_ID },
    headers: { "content-type": "application/json" },
    payload: JSON.stringify(payload),
  });

describe("customers authentication", () => {
  it("returns 401 'Not authenticated' without a session cookie", async () => {
    await buildApp();

    // The class-level `@UseGuards(SessionGuard)` replaces `router.use(requireAuth)`.
    const response = await get("/api/v1/customers", false);

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe("Not authenticated");
  });

  it("rejects every customers route, not just the list", async () => {
    await buildApp();

    // A guard on the controller covers all four handlers; none is accidentally public.
    const responses = await Promise.all([
      get("/api/v1/customers", false),
      get(`/api/v1/customers/${CUSTOMER_ID}`, false),
    ]);

    expect(responses.map((r) => r.statusCode)).toEqual([401, 401]);
  });
});

describe("GET /api/v1/customers", () => {
  it("returns the page envelope with a next cursor built from the last row", async () => {
    // Eleven rows for a limit of ten: the extra row only signals that more exist.
    const rows = Array.from({ length: 11 }, (_, i) =>
      customerRow(`Customer ${String(i).padStart(2, "0")}`, crypto.randomUUID()),
    );
    const { db } = await buildApp({ selectRows: rows });

    const response = await get("/api/v1/customers?limit=10");

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Customers fetched successfully");
    expect(body.data).toHaveLength(10);
    // The cursor is the sort value plus the id of the last *returned* row.
    expect(body.meta.nextCursor).toBe(`${rows[9]!.name}|${rows[9]!.id}`);
    // The eleventh row is what proves a next page exists; it is never sent to the client.
    expect(db.calls).toContain("limit:11");
  });

  it("ends pagination with a null cursor on the last page", async () => {
    const { db } = await buildApp({
      selectRows: [customerRow("Ada Obi", CUSTOMER_ID, "08012345678")],
    });

    const response = await get("/api/v1/customers?limit=10");

    expect(response.json().meta.nextCursor).toBeNull();
    expect(db.calls).toContain("limit:11");
  });

  it("applies the keyset filter only when a cursor is supplied", async () => {
    const { db } = await buildApp();

    await get("/api/v1/customers");
    expect(db.calls).toContain("where:none");

    // A cursor becomes a `(name, id) > (...)` range scan instead of an OFFSET.
    await get(`/api/v1/customers?cursor=Ada%20Obi|${CUSTOMER_ID}`);
    expect(db.calls).toContain("where:keyset");
  });

  it("defaults to a page of ten when no limit is given", async () => {
    const { db } = await buildApp();

    await get("/api/v1/customers");

    expect(db.calls).toContain("limit:11");
  });

  it("returns 400 'Invalid query parameters' for an out-of-range limit", async () => {
    await buildApp();

    const response = await get("/api/v1/customers?limit=101");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      statusCode: 400,
      message: "Invalid query parameters",
      errors: [{ field: "limit", message: "Limit must be at most 100" }],
    });
  });

  it("returns 400 for an unknown query key, because the schema is strict", async () => {
    await buildApp();

    // Unknown keys are rejected instead of silently ignored, so a client's typo is visible.
    const response = await get("/api/v1/customers?page=2");

    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { field: "", message: 'Unrecognized key: "page"' },
    ]);
  });

  it("returns 400 'Invalid pagination cursor' for a cursor with no separator", async () => {
    await buildApp();

    // `keysetCondition` validates the cursor, so a bad one never reaches Postgres.
    const response = await get("/api/v1/customers?cursor=garbage");

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe("Invalid pagination cursor");
  });
});

describe("GET /api/v1/customers/:id", () => {
  it("returns the customer projection", async () => {
    await buildApp({
      selectRows: [customerRow("Ada Obi", CUSTOMER_ID, "08012345678")],
    });

    const response = await get(`/api/v1/customers/${CUSTOMER_ID}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: "Customer fetched successfully",
      data: { id: CUSTOMER_ID, name: "Ada Obi", phoneNumber: "08012345678" },
    });
    // The detail endpoint exposes three columns, not the whole row.
    expect(response.json().data.createdAt).toBeUndefined();
  });

  it("returns 404 'Customer not found' when the database has no row", async () => {
    await buildApp({ selectRows: [] });

    const response = await get(
      "/api/v1/customers/00000000-0000-4000-8000-000000000000",
    );

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe("Customer not found");
  });

  it("returns 400 'Invalid route parameters' for a non-uuid id", async () => {
    const { db } = await buildApp();

    const response = await get("/api/v1/customers/not-a-uuid");

    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { field: "id", message: "Invalid id" },
    ]);
    // The pipe rejected the request, so no query was ever built.
    expect(db.calls).toEqual([]);
  });
});

describe("POST /api/v1/customers", () => {
  it("returns 201 with the created row", async () => {
    const created = customerRow("Ada Obi", CUSTOMER_ID, "08012345678");
    const { db } = await buildApp({ insertRows: [created] });

    const response = await send("POST", "/api/v1/customers", {
      name: "Ada Obi",
      phoneNumber: "08012345678",
    });

    // POST defaults to 201 in Nest; the envelope carries the same status.
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      success: true,
      statusCode: 201,
      message: "Customer created successfully",
      data: { id: CUSTOMER_ID, name: "Ada Obi" },
    });
    expect(db.inserted).toEqual([
      { name: "Ada Obi", phoneNumber: "08012345678" },
    ]);
  });

  it("omits phoneNumber entirely when the client did not send one", async () => {
    const { db } = await buildApp({
      insertRows: [customerRow("Lara", CUSTOMER_ID)],
    });

    await send("POST", "/api/v1/customers", { name: "Lara" });

    // The key must be absent, not `undefined`, so Postgres applies the column default.
    expect(db.inserted).toEqual([{ name: "Lara" }]);
    expect(Object.keys(db.inserted[0]!)).toEqual(["name"]);
  });

  it("returns 400 'Validation failed' with a field error for a short name", async () => {
    const { db } = await buildApp();

    const response = await send("POST", "/api/v1/customers", { name: "X" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: "Validation failed",
      errors: [{ field: "name", message: "Name must be at least 2 characters" }],
    });
    expect(db.calls).toEqual([]);
  });

  it("rejects unknown keys before touching the database", async () => {
    const { db } = await buildApp();

    const response = await send("POST", "/api/v1/customers", {
      name: "Ada Obi",
      isAdmin: true,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { field: "", message: 'Unrecognized key: "isAdmin"' },
    ]);
    expect(db.calls).toEqual([]);
  });
});

describe("PATCH /api/v1/customers/:id", () => {
  it("returns 200 with the updated row and sends only the changed fields", async () => {
    const { db } = await buildApp({
      updateRows: [customerRow("Ada Obi", CUSTOMER_ID, "08099999999")],
    });

    const response = await send(
      "PATCH",
      `/api/v1/customers/${CUSTOMER_ID}`,
      { phoneNumber: "08099999999" },
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: "Customer updated successfully",
      data: { phoneNumber: "08099999999" },
    });
    // A partial update must not send absent fields, or they would be written as NULL.
    expect(db.updated).toEqual([{ phoneNumber: "08099999999" }]);
  });

  it("returns 400 'No fields to update' for an empty patch and never queries", async () => {
    const { db } = await buildApp();

    const response = await send(
      "PATCH",
      `/api/v1/customers/${CUSTOMER_ID}`,
      {},
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe("No fields to update");
    expect(db.calls).toEqual([]);
  });

  it("returns 404 when the id does not exist", async () => {
    await buildApp({ updateRows: [] });

    const response = await send(
      "PATCH",
      `/api/v1/customers/${CUSTOMER_ID}`,
      { name: "Ada Obi" },
    );

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe("Customer not found");
  });
});

describe("Fastify routing parity with Express", () => {
  it("matches the collection route with a trailing slash", async () => {
    const { db } = await buildApp({
      selectRows: [customerRow("Ada Obi", CUSTOMER_ID, "08012345678")],
    });

    // Express treats `/customers` and `/customers/` as one route. Fastify's router does not
    // by default, and without `ignoreTrailingSlash` this URL matched `/:id` with an empty
    // id and failed as a 400 "Invalid route parameters".
    const response = await get("/api/v1/customers/");

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(db.calls).toContain("limit:11");
  });
});
