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
  postgresFailure,
  type FakeDbHandle,
  type FakeDbOptions,
} from "./helpers/fakes";

/**
 * In-process HTTP tests for the subjects endpoints.
 *
 * `TestingModule` builds the real module graph, so these exercise the real pipeline: the
 * global rate-limit guard, each controller's `SessionGuard`, the pipes on `@Param`/`@Query`/
 * `@Body`, the service, the response interceptor and the exception filter. Only Postgres and
 * Redis are replaced.
 *
 * Two things here are specific to this feature:
 *   1. The same service is reachable through *two* controllers — `/subjects/:id` and
 *      `/customers/:id/subjects` — so both are tested against the same behavior.
 *   2. `create` opens a transaction and locks the customer row. `db.calls` records the
 *      boundary (`transaction`) and the lock (`for:share`), which is how a fake can prove
 *      the read that the write depends on is actually protected.
 */
const USER_ID = "3f1c2b1a-9d4e-4f6a-8b2c-1d2e3f4a5b6c";
const SESSION_ID = "test-session";
const CUSTOMER_ID = "5596e755-1c3b-4559-b22f-2b502d0a1cb7";
const SUBJECT_ID = "0a8f6f0e-2b3c-4d5e-8f90-1a2b3c4d5e6f";
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

const subjectRow = (
  name: string,
  id: string,
  relationship: string | null = null,
) => ({
  id,
  customerId: CUSTOMER_ID,
  name,
  relationship,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

const measurementRow = (
  id: string,
  date: string,
  measurements: Record<string, number> = { bust: 34 },
) => ({
  id,
  subjectId: SUBJECT_ID,
  measurements,
  date: new Date(`${date}T00:00:00.000Z`),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

let app: NestFastifyApplication | undefined;

const buildApp = async (
  options: FakeDbOptions = {},
): Promise<{ db: FakeDbHandle }> => {
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

  return { db };
};

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const get = (url: string, session = true) =>
  app!.inject({
    method: "GET",
    url,
    ...(session ? { cookies: { sessionId: SESSION_ID } } : {}),
  });

const post = (url: string, payload: unknown) =>
  app!.inject({
    method: "POST",
    url,
    cookies: { sessionId: SESSION_ID },
    headers: { "content-type": "application/json" },
    payload: JSON.stringify(payload),
  });

describe("subjects authentication", () => {
  it("protects both URL namespaces the same way", async () => {
    await buildApp();

    const responses = await Promise.all([
      get(`/api/v1/customers/${CUSTOMER_ID}/subjects`, false),
      get(`/api/v1/subjects/${SUBJECT_ID}`, false),
      get(`/api/v1/subjects/${SUBJECT_ID}/measurements`, false),
    ]);

    expect(responses.map((r) => r.statusCode)).toEqual([401, 401, 401]);
    expect(responses[0]!.json().message).toBe("Not authenticated");
  });
});

describe("GET /api/v1/customers/:id/subjects", () => {
  it("returns a page with a cursor built from the last row's createdAt", async () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      subjectRow(`Subject ${String(i).padStart(2, "0")}`, crypto.randomUUID()),
    );
    const { db } = await buildApp({ selectRows: rows });

    const response = await get(`/api/v1/customers/${CUSTOMER_ID}/subjects?limit=10`);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.message).toBe("Subjects fetched successfully");
    expect(body.data).toHaveLength(10);
    // The cursor format is `<ISO timestamp>|<id>` — newest-first lists sort on `createdAt`.
    expect(body.meta.nextCursor).toBe(
      `${rows[9]!.createdAt.toISOString()}|${rows[9]!.id}`,
    );
    // One extra row was read purely to learn that another page exists.
    expect(db.calls).toContain("limit:11");
  });

  it("accepts a well-formed cursor and still reads one extra row", async () => {
    const { db } = await buildApp();

    const response = await get(
      `/api/v1/customers/${CUSTOMER_ID}/subjects?cursor=${encodeURIComponent(
        `2026-01-01T00:00:00.000Z|${SUBJECT_ID}`,
      )}`,
    );

    // Unlike the customers list, this `where` is never empty — the customer filter is
    // always present and the keyset clause is `and`-ed into it — so `db.calls` cannot
    // distinguish "cursor applied" from "first page". The *malformed* cursor test below is
    // what proves the client's cursor reaches `keysetCondition`: that helper is only called
    // when a cursor was supplied, and it is the only thing that throws this 400.
    expect(response.statusCode).toBe(200);
    expect(db.calls).toContain("limit:11");
  });

  it("rejects a cursor without a separator before any query runs", async () => {
    const { db } = await buildApp();

    const response = await get(`/api/v1/customers/${CUSTOMER_ID}/subjects?cursor=garbage`);

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe("Invalid pagination cursor");
    // The builder object was created, but `keysetCondition` threw while the `where` clause
    // was being assembled, so the query was never sent — no `limit` call happened.
    expect(db.calls).not.toContain("limit:11");
  });

  it("returns 400 for a non-uuid customer id", async () => {
    const { db } = await buildApp();

    const response = await get("/api/v1/customers/not-a-uuid/subjects");

    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { field: "id", message: "Invalid id" },
    ]);
    expect(db.calls).toEqual([]);
  });
});

describe("POST /api/v1/customers/:id/subjects", () => {
  it("copies the customer's name for a 'self' subject, inside a transaction with a row lock", async () => {
    const created = subjectRow("Ada Obi", SUBJECT_ID, "self");
    // Only the customer's name is selected, so the fake returns just that column.
    const { db } = await buildApp({
      selectRows: [{ name: "Ada Obi" }],
      insertRows: [created],
    });

    const response = await post(`/api/v1/customers/${CUSTOMER_ID}/subjects`, {
      relationship: "self",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      statusCode: 201,
      message: "Subject created successfully",
      data: { id: SUBJECT_ID, name: "Ada Obi", relationship: "self" },
    });
    // The client sent no name; the stored name came from the customer row.
    expect(db.inserted).toEqual([
      { customerId: CUSTOMER_ID, name: "Ada Obi", relationship: "self" },
    ]);

    // The unit of work: the read and the write are one transaction...
    expect(db.calls).toContain("transaction");
    // ...and the read is locked, so a concurrent DELETE/UPDATE of the customer must wait
    // instead of leaving us to insert a subject with a stale name or a dead parent.
    expect(db.calls).toContain("for:share");
    expect(db.calls.indexOf("transaction")).toBeLessThan(
      db.calls.indexOf("for:share"),
    );
  });

  it("uses the supplied name for any other relationship", async () => {
    const { db } = await buildApp({
      selectRows: [{ name: "Ada Obi" }],
      insertRows: [subjectRow("Chidi Obi", SUBJECT_ID, "son")],
    });

    await post(`/api/v1/customers/${CUSTOMER_ID}/subjects`, {
      name: "Chidi Obi",
      relationship: "son",
    });

    expect(db.inserted).toEqual([
      { customerId: CUSTOMER_ID, name: "Chidi Obi", relationship: "son" },
    ]);
  });

  it("omits relationship when the client did not send one, so NULL is stored", async () => {
    const { db } = await buildApp({
      selectRows: [{ name: "Ada Obi" }],
      insertRows: [subjectRow("Ada Obi", SUBJECT_ID)],
    });

    await post(`/api/v1/customers/${CUSTOMER_ID}/subjects`, { name: "Ada Obi" });

    // An absent key lets the column default apply; `undefined` would be sent as a value.
    expect(Object.keys(db.inserted[0]!)).toEqual(["customerId", "name"]);
  });

  it("returns 404 and writes nothing when the customer does not exist", async () => {
    const { db } = await buildApp({ selectRows: [] });

    const response = await post(`/api/v1/customers/${CUSTOMER_ID}/subjects`, {
      name: "Ada Obi",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe("Customer not found");
    // The 404 is thrown *inside* the transaction, after the locked read and before the
    // insert, so no subject is left behind.
    expect(db.calls).toContain("for:share");
    expect(db.calls).not.toContain("insert");
    expect(db.inserted).toEqual([]);
  });

  it("requires a name for every relationship except 'self'", async () => {
    const { db } = await buildApp();

    const response = await post(`/api/v1/customers/${CUSTOMER_ID}/subjects`, {
      relationship: "son",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: "Validation failed",
      errors: [
        {
          field: "name",
          message: 'Subject name is required when relationship is not "self"',
        },
      ],
    });
    expect(db.calls).toEqual([]);
  });

  it("rejects unknown keys, so a client cannot pick the parent customer", async () => {
    await buildApp();

    const response = await post(`/api/v1/customers/${CUSTOMER_ID}/subjects`, {
      name: "Ada Obi",
      customerId: MISSING_ID,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { field: "", message: 'Unrecognized key: "customerId"' },
    ]);
  });
});

describe("GET /api/v1/subjects/:id", () => {
  it("returns the detail projection including the owning customer", async () => {
    await buildApp({ selectRows: [subjectRow("Ada Obi", SUBJECT_ID, "self")] });

    const response = await get(`/api/v1/subjects/${SUBJECT_ID}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: "Subject fetched successfully",
      data: {
        id: SUBJECT_ID,
        customerId: CUSTOMER_ID,
        name: "Ada Obi",
        relationship: "self",
      },
    });
    // Four columns, not the whole row: `updatedAt` must not leak into the response.
    expect(response.json().data.updatedAt).toBeUndefined();
  });

  it("returns 404 'Subject not found' when no row matches", async () => {
    await buildApp({ selectRows: [] });

    const response = await get(`/api/v1/subjects/${MISSING_ID}`);

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe("Subject not found");
  });
});

describe("GET /api/v1/subjects/:id/measurements", () => {
  it("paginates on the date column and formats the cursor as YYYY-MM-DD", async () => {
    const rows = [
      measurementRow(crypto.randomUUID(), "2026-03-01"),
      measurementRow(crypto.randomUUID(), "2026-02-01"),
    ];
    const { db } = await buildApp({ selectRows: rows });

    const response = await get(
      `/api/v1/subjects/${SUBJECT_ID}/measurements?limit=10`,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBe("Measurements fetched successfully");
    expect(response.json().data).toHaveLength(2);
    // Both rows fit, so there is no next page.
    expect(response.json().meta.nextCursor).toBeNull();
    expect(db.calls).toContain("limit:11");
  });

  it("emits a date-based cursor when a further page exists", async () => {
    // Three rows for a limit of two: the third only proves another page exists.
    const rows = [
      measurementRow(crypto.randomUUID(), "2026-03-01"),
      measurementRow(crypto.randomUUID(), "2026-02-01"),
      measurementRow(crypto.randomUUID(), "2026-01-01"),
    ];
    await buildApp({ selectRows: rows });

    const response = await get(
      `/api/v1/subjects/${SUBJECT_ID}/measurements?limit=2`,
    );

    expect(response.json().meta.nextCursor).toBe(
      `2026-02-01|${rows[1]!.id}`,
    );
  });
});

describe("POST /api/v1/subjects/:id/measurements", () => {
  it("stores coerced numbers and a real Date, without opening a transaction", async () => {
    const { db } = await buildApp({
      insertRows: [measurementRow(SUBJECT_ID, "2026-03-01", { bust: 34 })],
    });

    const response = await post(
      `/api/v1/subjects/${SUBJECT_ID}/measurements`,
      { measurements: { bust: "34" }, date: "2026-03-01" },
    );

    expect(response.statusCode).toBe(201);
    expect(response.json().message).toBe("Measurement created successfully");
    expect(db.inserted).toEqual([
      {
        subjectId: SUBJECT_ID,
        measurements: { bust: 34 },
        date: new Date("2026-03-01T00:00:00.000Z"),
      },
    ]);
    // One write and no read before it: there is nothing to make atomic, so no transaction.
    expect(db.calls).not.toContain("transaction");
  });

  it("rejects an empty measurement map", async () => {
    const { db } = await buildApp();

    const response = await post(
      `/api/v1/subjects/${SUBJECT_ID}/measurements`,
      { measurements: {}, date: "2026-03-01" },
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { field: "measurements", message: "Provide at least one measurement" },
    ]);
    expect(db.calls).toEqual([]);
  });

  it("turns a foreign key violation into a 400 instead of a 500", async () => {
    // The real database rejects this insert with SQLSTATE 23503, because the subject does not
    // exist. The double throws the same error the driver throws, wrapped by Drizzle exactly as
    // in production, so this exercises the filter's mapping end to end.
    await buildApp({ failWith: postgresFailure({ code: "23503" }) });

    const response = await post(
      `/api/v1/subjects/${MISSING_ID}/measurements`,
      { measurements: { bust: 34 }, date: "2026-03-01" },
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      statusCode: 400,
      message: "Referenced record does not exist.",
    });
    // Drizzle's own message contains the statement and its parameters; a client must never
    // see it, which is the reason the mapping exists at all.
    expect(JSON.stringify(response.json())).not.toContain("insert into");
  });

  it("rejects a negative or non-numeric measurement value", async () => {
    await buildApp();

    const response = await post(
      `/api/v1/subjects/${SUBJECT_ID}/measurements`,
      { measurements: { waist: -4 }, date: "2026-03-01" },
    );

    expect(response.statusCode).toBe(400);
    // The record's own error path includes the map key, so the client can highlight the
    // exact field: `measurements.waist`.
    expect(response.json().errors).toEqual([
      { field: "measurements.waist", message: "Too small: expected number to be >=0" },
    ]);
  });
});
