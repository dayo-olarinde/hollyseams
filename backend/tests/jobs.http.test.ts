import { createHash } from "node:crypto";
import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { DRIZZLE, PG_CLIENT } from "../src/database/database.module";
import { CLOUDINARY } from "../src/media/cloudinary.service";
import { PhotoCleanupService } from "../src/media/photo-cleanup.service";
import { REDIS } from "../src/redis/redis.module";
import { configureApp, createHttpAdapter } from "../src/setup-app";
import {
  FakeRedis,
  fakeCloudinary,
  fakePgClient,
  fakePhotoCleanup,
  fakeQueryDb,
  type FakeCloudinaryHandle,
  type FakeCloudinaryOptions,
  type FakeDbHandle,
  type FakeDbOptions,
  type FakePhotoCleanupHandle,
} from "./helpers/fakes";

/**
 * In-process HTTP tests for the jobs endpoints.
 *
 * Everything in the pipeline is real except Postgres, Redis and Cloudinary: the global
 * rate-limit guard, each controller's `SessionGuard`, the pipes, the services, the four
 * transactions, the response interceptor and the exception filter.
 *
 * `rowsByTable` is what makes a multi-table flow testable: `POST /jobs/new-customer` inserts into
 * four tables and `GET /jobs/:id` reads two, so a single canned `selectRows` would have every
 * statement return the same row. Table-keyed rows keep each statement's answer honest.
 *
 * `db.calls` is the second half of the story — it records `transaction`, `from:<table>`,
 * `into:<table>` and `for:<lock>`, which is how these tests prove *where* the writes happen (one
 * transaction, not four) and that a read a write depends on is locked.
 */
const USER_ID = "3f1c2b1a-9d4e-4f6a-8b2c-1d2e3f4a5b6c";
const SESSION_ID = "test-session";
const CUSTOMER_ID = "5596e755-1c3b-4559-b22f-2b502d0a1cb7";
const SUBJECT_ID = "0a8f6f0e-2b3c-4d5e-8f90-1a2b3c4d5e6f";
const MEASUREMENT_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const JOB_ID = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
const PAYMENT_ID = "c1b2a3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const PAYMENT_KEY = "9f8fad5b-d9cb-4a6f-a165-70867728950e";
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

const PHOTO_PUBLIC_ID = "hollyseams/photos/style-1";
const OUTSIDE_PUBLIC_ID = "some-other-app/photo";
const MISSING_PHOTO_PUBLIC_ID = "hollyseams/photos/gone";
const OLD_PHOTO_PUBLIC_ID = "hollyseams/photos/old-cover";

const AT = new Date("2026-01-01T00:00:00.000Z");

/** A row of `jobListSelect` (what `GET /jobs` returns). */
const jobListRow = (id: string, createdAt = AT) => ({
  id,
  subjectId: SUBJECT_ID,
  subjectName: "Ada Obi",
  measurementId: MEASUREMENT_ID,
  coverUrl: null,
  photoCount: 0,
  description: "Ankara gown",
  agreedPrice: 120,
  status: "pending" as const,
  dueDate: null,
  deliveredAt: null,
  createdAt,
});

/** A row of the detail projection (`GET /jobs/:id`). */
const jobDetailRow = (overrides: Record<string, unknown> = {}) => ({
  id: JOB_ID,
  customerId: CUSTOMER_ID,
  customerPhone: "08012345678",
  subjectId: SUBJECT_ID,
  subjectName: "Ada Obi",
  measurementsId: MEASUREMENT_ID,
  measurements: { bust: 34 },
  styleRef: [],
  finishedJob: [],
  description: "Ankara gown",
  agreedPrice: 120,
  status: "pending",
  dueDate: null,
  deliveredAt: null,
  createdAt: AT,
  ...overrides,
});

/** A full `jobs` row (what an INSERT/UPDATE returns). */
const jobRow = (overrides: Record<string, unknown> = {}) => ({
  id: JOB_ID,
  customerId: CUSTOMER_ID,
  subjectId: SUBJECT_ID,
  measurementId: MEASUREMENT_ID,
  styleRef: [],
  finishedJob: [],
  description: "",
  agreedPrice: 120,
  status: "pending",
  dueDate: null,
  deliveredAt: null,
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
});

/** A full `payments` row. `idempotencyKey` is `null` for rows written before the column, which
 * an exception test below relies on; the idempotency tests override it. */
const paymentRow = (overrides: Record<string, unknown> = {}) => ({
  id: PAYMENT_ID,
  jobId: JOB_ID,
  amount: 50,
  paidAt: new Date("2026-02-01T00:00:00.000Z"),
  idempotencyKey: null,
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
});

let app: NestFastifyApplication | undefined;

interface BuildOptions {
  db?: FakeDbOptions;
  cloudinary?: FakeCloudinaryOptions;
  /** Keep the real Cloudinary SDK (needed to sign an upload the way Cloudinary does). */
  realCloudinary?: boolean;
}

const buildApp = async (
  options: BuildOptions = {},
): Promise<{
  db: FakeDbHandle;
  cloud: FakeCloudinaryHandle;
  cleanup: FakePhotoCleanupHandle;
}> => {
  const db = fakeQueryDb(options.db ?? {});
  const cloud = fakeCloudinary(options.cloudinary ?? {});
  const cleanup = fakePhotoCleanup();
  const redis = new FakeRedis({
    seed: { [`session:${SESSION_ID}`]: JSON.stringify({ id: USER_ID }) },
  });

  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(REDIS)
    .useValue(redis)
    .overrideProvider(DRIZZLE)
    .useValue(db.db)
    .overrideProvider(PG_CLIENT)
    .useValue(fakePgClient())
    // The real queue dials Redis in its constructor; the double keeps this suite offline.
    .overrideProvider(PhotoCleanupService)
    .useValue(cleanup.service);

  if (!options.realCloudinary) {
    builder.overrideProvider(CLOUDINARY).useValue(cloud.client);
  }

  const moduleRef = await builder.compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(
    createHttpAdapter(),
    { logger: false },
  );
  await configureApp(app);
  await app.init();

  return { db, cloud, cleanup };
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

const send = (
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) =>
  app!.inject({
    method,
    url,
    cookies: { sessionId: SESSION_ID },
    headers: {
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
  });

/** A minimal valid create body: everything else has a schema default. */
const jobPayload = (overrides: Record<string, unknown> = {}) => ({
  measurementId: MEASUREMENT_ID,
  job: { agreedPrice: 120, ...overrides },
});

describe("jobs authentication", () => {
  it("protects every jobs route, including the upload signature", async () => {
    await buildApp();

    const responses = await Promise.all([
      get("/api/v1/jobs", false),
      get("/api/v1/jobs/counts", false),
      get("/api/v1/jobs/signature", false),
      get(`/api/v1/jobs/${JOB_ID}`, false),
      get(`/api/v1/customers/${CUSTOMER_ID}/jobs`, false),
    ]);

    expect(responses.map((r) => r.statusCode)).toEqual([401, 401, 401, 401, 401]);
    expect(responses[1]!.json().message).toBe("Not authenticated");
  });
});

describe("Fastify routing where Express needed declaration order", () => {
  it("serves GET /jobs/signature instead of treating 'signature' as a job id", async () => {
    // Express had to register `/signature` BEFORE `/:id` or the uuid validator rejected it.
    // Fastify prefers a static segment over a parametric one, in any order.
    await buildApp();

    const response = await get("/api/v1/jobs/signature");

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBe("Signature generated");
    // Asserting the real signature value belongs to the dedicated test below (this app is built
    // with the fake provider, whose signature is a placeholder).
    expect(response.json().data.folder).toBe("hollyseams/photos");
  });

  it("serves POST /jobs/new-customer instead of matching POST /jobs/:id", async () => {
    const { db } = await buildApp({
      db: {
        rowsByTable: {
          customers: [{ ...jobRow(), name: "Ada Obi" }],
          subjects: [jobRow()],
          measurements: [jobRow()],
          jobs: [jobRow()],
        },
      },
    });

    const response = await send("POST", "/api/v1/jobs/new-customer", {
      customer: { name: "Ada Obi" },
      subjects: [{ measurements: { bust: 34 } }],
      job: { agreedPrice: 120 },
    });

    // A 400 about an invalid uuid would mean `:id` won the match.
    expect(response.statusCode).toBe(201);
    expect(db.calls).toContain("into:customers");
  });
});

describe("GET /api/v1/jobs/signature", () => {
  it("signs the exact string Cloudinary expects, with the app's folder and no expiry drift", async () => {
    // No `realCloudinary` override here on purpose: signing is pure crypto, so the real SDK runs
    // and the assertion below is checked against Cloudinary's documented algorithm
    // (`sha1("<sorted params>" + api_secret)`, values unencoded) rather than against a fake.
    await buildApp({ realCloudinary: true });

    const response = await get("/api/v1/jobs/signature");
    const data = response.json().data;

    const expected = createHash("sha1")
      .update(`folder=${data.folder}&timestamp=${data.timestamp}test-secret`)
      .digest("hex");

    expect(data.signature).toBe(expected);
    expect(data.folder).toBe("hollyseams/photos");
    expect(data.cloudName).toBe("test-cloud");
    expect(data.apiKey).toBe("test-key");
    expect(data.resourceType).toBe("image");
    // The client is told the window is 15 minutes.
    expect(data.expiresAt - data.timestamp).toBe(15 * 60);
  });
});

describe("GET /api/v1/jobs", () => {
  it("returns a page with a cursor built from the last row", async () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      jobListRow(crypto.randomUUID(), new Date(2026, 0, 1, 0, i)),
    );
    const { db } = await buildApp({ db: { rowsByTable: { jobs: rows } } });

    const response = await get("/api/v1/jobs?limit=10");

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBe("Jobs fetched successfully");
    expect(response.json().data).toHaveLength(10);
    expect(response.json().meta.nextCursor).toBe(
      `${rows[9]!.createdAt.toISOString()}|${rows[9]!.id}`,
    );
    expect(db.calls).toContain("limit:11");
  });

  it("accepts each status tab and rejects one that is not a tab", async () => {
    await buildApp();

    const delivered = await get("/api/v1/jobs?status=delivered");
    expect(delivered.statusCode).toBe(200);

    const bogus = await get("/api/v1/jobs?status=archived");
    expect(bogus.statusCode).toBe(400);
    expect(bogus.json().errors).toEqual([
      {
        field: "status",
        message:
          'Invalid option: expected one of "pending"|"completed"|"delivered"',
      },
    ]);
  });

  it("still rejects unknown query keys after the query schema is extended", async () => {
    await buildApp();

    // `listJobsQuerySchema` is `listQuerySchema.extend({ status })`, so this pins that extending
    // a strict object keeps it strict instead of silently ignoring `?page=2`.
    const response = await get("/api/v1/jobs?page=2");

    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { field: "", message: 'Unrecognized key: "page"' },
    ]);
  });
});

describe("GET /api/v1/jobs/counts", () => {
  /**
   * The one row the aggregate statement returns. `count(<case>)` counts the non-null rows each
   * case produces, so these five numbers model a studio with 7 jobs split across the tabs.
   * `overdue` is additive (a pending job past its due date), not a sixth tab — which is why it
   * is 1 while all/pending/ready/delivered still add up to 7.
   * The fake trims the row to the selected columns, exactly as the real builder does.
   */
  const countRow = { all: 7, pending: 3, ready: 2, delivered: 2, overdue: 1 };

  it("aggregates the tab counts in one statement", async () => {
    const { db } = await buildApp({ db: { rowsByTable: { jobs: [countRow] } } });

    const response = await get("/api/v1/jobs/counts");

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(countRow);
    // A single statement: one `select`, one `from`, and no pagination window.
    expect(db.calls).toEqual(["select", "from:jobs"]);
  });

  it("serves 'counts' rather than treating it as a job id", async () => {
    // `:id` is validated as a uuid, so a 400 here would mean the parametric route won.
    await buildApp({ db: { rowsByTable: { jobs: [countRow] } } });

    const response = await get("/api/v1/jobs/counts");

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBe("Job counts fetched successfully");
  });
});

describe("GET /api/v1/customers/:id/jobs", () => {
  it("returns the same envelope as the global list", async () => {
    await buildApp({ db: { rowsByTable: { jobs: [jobListRow(JOB_ID)] } } });

    const response = await get(`/api/v1/customers/${CUSTOMER_ID}/jobs`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: "Jobs fetched successfully",
      data: [{ id: JOB_ID, subjectName: "Ada Obi" }],
      meta: { nextCursor: null },
    });
  });

  it("rejects a non-uuid customer id", async () => {
    const { db } = await buildApp();

    const response = await get("/api/v1/customers/nope/jobs");

    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { field: "id", message: "Invalid id" },
    ]);
    expect(db.calls).toEqual([]);
  });
});

describe("GET /api/v1/jobs/:id", () => {
  it("returns the job, its measurements and its payment history", async () => {
    await buildApp({
      db: {
        rowsByTable: {
          jobs: [jobDetailRow()],
          payments: [paymentRow()],
        },
      },
    });

    const response = await get(`/api/v1/jobs/${JOB_ID}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: "Job fetched successfully",
      data: {
        id: JOB_ID,
        customerId: CUSTOMER_ID,
        subjectName: "Ada Obi",
        measurements: { bust: 34 },
        payments: [{ id: PAYMENT_ID, amount: 50 }],
      },
    });
  });

  it("returns 404 'Job not found' when the row is missing", async () => {
    await buildApp({ db: { rowsByTable: { jobs: [] } } });

    const response = await get(`/api/v1/jobs/${MISSING_ID}`);

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe("Job not found");
  });
});

describe("POST /api/v1/jobs/:id (job for an existing subject)", () => {
  it("takes the customer from the subject row and runs in one transaction with share locks", async () => {
    const { db, cloud } = await buildApp({
      db: {
        rowsByTable: {
          subjects: [{ id: SUBJECT_ID, customerId: CUSTOMER_ID }],
          measurements: [{ id: MEASUREMENT_ID }],
          jobs: [jobRow()],
        },
      },
    });

    const response = await send(
      "POST",
      `/api/v1/jobs/${SUBJECT_ID}`,
      jobPayload(),
    );

    expect(response.statusCode).toBe(201);
    expect(response.json().message).toBe("Job created successfully");

    // The customer id is NOT taken from the request body — there is no field for it.
    expect(db.inserted[0]).toMatchObject({
      customerId: CUSTOMER_ID,
      subjectId: SUBJECT_ID,
      measurementId: MEASUREMENT_ID,
      styleRef: [],
      finishedJob: [],
      status: "pending",
    });

    // One unit of work (§18.4: read-then-write ⇒ transaction + lock the read).
    expect(db.calls).toContain("transaction");
    expect(db.calls.filter((call) => call === "for:share")).toHaveLength(2);
    expect(db.calls.filter((call) => call === "into:jobs")).toHaveLength(1);
    // No photo was sent, so the provider was never asked.
    expect(cloud.verified).toEqual([]);
  });

  it("resolves photos through the provider instead of trusting the client", async () => {
    const { db, cloud } = await buildApp({
      db: {
        rowsByTable: {
          subjects: [{ id: SUBJECT_ID, customerId: CUSTOMER_ID }],
          measurements: [{ id: MEASUREMENT_ID }],
          jobs: [jobRow()],
        },
      },
    });

    await send(
      "POST",
      `/api/v1/jobs/${SUBJECT_ID}`,
      jobPayload({
        styleRef: [{ publicId: PHOTO_PUBLIC_ID, alt: "Style reference" }],
      }),
    );

    expect(cloud.verified).toEqual([PHOTO_PUBLIC_ID]);
    // The stored URL comes from the provider's response, never from the request.
    expect(db.inserted[0]!.styleRef).toEqual([
      {
        url: `https://res.cloudinary.com/test-cloud/image/upload/${PHOTO_PUBLIC_ID}.jpg`,
        publicId: PHOTO_PUBLIC_ID,
        alt: "Style reference",
      },
    ]);
  });

  it("refuses a photo from outside the app's upload folder", async () => {
    const { db } = await buildApp({
      db: {
        rowsByTable: {
          subjects: [{ id: SUBJECT_ID, customerId: CUSTOMER_ID }],
          measurements: [{ id: MEASUREMENT_ID }],
          jobs: [jobRow()],
        },
      },
    });

    const response = await send(
      "POST",
      `/api/v1/jobs/${SUBJECT_ID}`,
      jobPayload({
        styleRef: [{ publicId: OUTSIDE_PUBLIC_ID, alt: "Not ours" }],
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe(
      `Photo "${OUTSIDE_PUBLIC_ID}" is not inside the app's upload folder`,
    );
    // Verified, then rejected before any write.
    expect(db.calls).not.toContain("insert");
  });

  it("maps a missing photo to 400 and a provider outage to 502", async () => {
    const missingPhoto = await buildApp({
      db: {
        rowsByTable: {
          subjects: [{ id: SUBJECT_ID, customerId: CUSTOMER_ID }],
          measurements: [{ id: MEASUREMENT_ID }],
          jobs: [jobRow()],
        },
      },
      cloudinary: { missing: [MISSING_PHOTO_PUBLIC_ID] },
    });

    const notFound = await send(
      "POST",
      `/api/v1/jobs/${SUBJECT_ID}`,
      jobPayload({
        finishedJob: [{ publicId: MISSING_PHOTO_PUBLIC_ID, alt: "Gone" }],
      }),
    );

    expect(notFound.statusCode).toBe(400);
    expect(notFound.json().message).toBe(
      `Photo "${MISSING_PHOTO_PUBLIC_ID}" does not exist in storage`,
    );
    expect(missingPhoto.db.calls).not.toContain("transaction");

    await buildApp({
      db: {
        rowsByTable: {
          subjects: [{ id: SUBJECT_ID, customerId: CUSTOMER_ID }],
          measurements: [{ id: MEASUREMENT_ID }],
          jobs: [jobRow()],
        },
      },
      cloudinary: { providerDown: true },
    });

    const outage = await send(
      "POST",
      `/api/v1/jobs/${SUBJECT_ID}`,
      jobPayload({
        styleRef: [{ publicId: PHOTO_PUBLIC_ID, alt: "Style" }],
      }),
    );

    // The client's request was fine — the provider is broken, so it is not a 400.
    expect(outage.statusCode).toBe(502);
    expect(outage.json().message).toBe(
      "Could not verify photo with the image provider",
    );
  });

  it("rejects a photo payload that tries to supply its own url", async () => {
    await buildApp();

    const response = await send(
      "POST",
      `/api/v1/jobs/${SUBJECT_ID}`,
      jobPayload({
        styleRef: [
          {
            publicId: PHOTO_PUBLIC_ID,
            alt: "Style",
            url: "https://evil.example.com/x.jpg",
          },
        ],
      }),
    );

    expect(response.statusCode).toBe(400);
    // The path includes the parent key and the array index: `job.styleRef.0`.
    expect(response.json().errors).toEqual([
      { field: "job.styleRef.0", message: 'Unrecognized key: "url"' },
    ]);
  });

  it("returns 404 'Subject not found' without inserting anything", async () => {
    const { db } = await buildApp({
      db: {
        rowsByTable: {
          subjects: [],
          measurements: [{ id: MEASUREMENT_ID }],
          jobs: [jobRow()],
        },
      },
    });

    const response = await send(
      "POST",
      `/api/v1/jobs/${SUBJECT_ID}`,
      jobPayload(),
    );

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe("Subject not found");
    // Thrown inside the transaction, after the locked read: no job row is left behind.
    expect(db.calls).toContain("for:share");
    expect(db.calls).not.toContain("into:jobs");
  });

  it("rejects a measurement that belongs to another subject", async () => {
    const { db } = await buildApp({
      db: {
        rowsByTable: {
          subjects: [{ id: SUBJECT_ID, customerId: CUSTOMER_ID }],
          // The measurement lookup filters on subject too, so it finds nothing.
          measurements: [],
          jobs: [jobRow()],
        },
      },
    });

    const response = await send(
      "POST",
      `/api/v1/jobs/${SUBJECT_ID}`,
      jobPayload(),
    );

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe(
      "Measurement not found for this subject",
    );
    expect(db.calls).not.toContain("into:jobs");
  });

  it("rejects an empty patch and an unknown key before any query", async () => {
    const { db } = await buildApp();

    const empty = await send("POST", `/api/v1/jobs/${SUBJECT_ID}`, {
      measurementId: MEASUREMENT_ID,
      job: {},
    });
    expect(empty.statusCode).toBe(400);
    // `z.coerce.number()` on a missing value coerces first, so the message says `NaN` rather
    // than `undefined` — the price is the one field with no default on a job.
    expect(empty.json().errors).toEqual([
      {
        field: "job.agreedPrice",
        message: "Invalid input: expected number, received NaN",
      },
    ]);

    const unknownKey = await send("POST", `/api/v1/jobs/${SUBJECT_ID}`, {
      ...jobPayload(),
      customerId: CUSTOMER_ID,
    });
    expect(unknownKey.statusCode).toBe(400);
    expect(unknownKey.json().errors).toEqual([
      { field: "", message: 'Unrecognized key: "customerId"' },
    ]);

    expect(db.calls).toEqual([]);
  });
});

describe("POST /api/v1/jobs/new-customer", () => {
  it("creates customer, subject, measurement and job in ONE transaction", async () => {
    const { db } = await buildApp({
      db: {
        rowsByTable: {
          customers: [{ ...jobRow(), name: "Ada Obi", phoneNumber: null }],
          subjects: [jobRow()],
          measurements: [jobRow()],
          jobs: [jobRow()],
        },
      },
    });

    const response = await send("POST", "/api/v1/jobs/new-customer", {
      customer: { name: "Ada Obi", phoneNumber: "08012345678" },
      subjects: [{ measurements: { bust: 34, waist: 30 } }],
      job: { agreedPrice: 120, description: "Ankara gown" },
    });

    expect(response.statusCode).toBe(201);

    // Four inserts, four tables, in dependency order…
    expect(db.calls.filter((call) => call === "into:customers")).toHaveLength(1);
    expect(db.calls.filter((call) => call === "into:subjects")).toHaveLength(1);
    expect(db.calls.filter((call) => call === "into:measurements")).toHaveLength(1);
    expect(db.calls.filter((call) => call === "into:jobs")).toHaveLength(1);
    // …all inside exactly one transaction, and with no row lock: nothing is read first.
    expect(db.calls.filter((call) => call === "transaction")).toHaveLength(1);
    expect(db.calls).not.toContain("for:share");
    expect(db.calls).not.toContain("for:update");

    // The `self` subject inherits the name of the customer created in this same transaction.
    expect(db.inserted[1]).toMatchObject({
      name: "Ada Obi",
      relationship: "self",
    });
    // The measurement row is stamped with a real date, not the job's due date.
    expect((db.inserted[2]!.date as Date).getTime()).toBeGreaterThan(0);
    // The job references the ids the transaction just created.
    expect(db.inserted[3]).toMatchObject({
      customerId: JOB_ID,
      subjectId: JOB_ID,
      measurementId: JOB_ID,
      agreedPrice: 120,
    });
  });

  it("requires exactly one subject and a name when the relationship is not 'self'", async () => {
    await buildApp();

    const twoSubjects = await send("POST", "/api/v1/jobs/new-customer", {
      customer: { name: "Ada Obi" },
      subjects: [
        { measurements: { bust: 34 } },
        { measurements: { bust: 36 } },
      ],
      job: { agreedPrice: 120 },
    });
    expect(twoSubjects.statusCode).toBe(400);
    expect(twoSubjects.json().errors).toEqual([
      { field: "subjects", message: "Exactly one subject is required per job" },
    ]);

    const unnamed = await send("POST", "/api/v1/jobs/new-customer", {
      customer: { name: "Ada Obi" },
      subjects: [{ relationship: "daughter", measurements: { bust: 34 } }],
      job: { agreedPrice: 120 },
    });
    expect(unnamed.statusCode).toBe(400);
    // Nested under an array, the path carries the index: `subjects.0.name`. That is the field
    // the frontend needs to highlight the right input in the new-job form.
    expect(unnamed.json().errors).toEqual([
      {
        field: "subjects.0.name",
        message: 'Subject name is required when relationship is not "self"',
      },
    ]);
  });
});

describe("PATCH /api/v1/jobs/:id", () => {
  it("patches scalars without reading the job or touching photos", async () => {
    const { db, cloud } = await buildApp({
      db: { rowsByTable: { jobs: [jobRow({ status: "completed" })] } },
    });

    const response = await send("PATCH", `/api/v1/jobs/${JOB_ID}`, {
      status: "completed",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBe("Job updated successfully");
    expect(db.updated).toEqual([{ status: "completed" }]);
    // No photos in the patch ⇒ no detail read and no provider call: the cheap path.
    expect(db.calls).not.toContain("select");
    expect(cloud.verified).toEqual([]);
  });

  it("queues a photo the update replaces, after the write succeeds", async () => {
    const { db, cloud, cleanup } = await buildApp({
      db: {
        rowsByTable: {
          jobs: [
            jobDetailRow({
              styleRef: [{ url: "https://old", publicId: OLD_PHOTO_PUBLIC_ID, alt: "Old" }],
            }),
          ],
        },
      },
    });

    await send("PATCH", `/api/v1/jobs/${JOB_ID}`, {
      styleRef: [{ publicId: PHOTO_PUBLIC_ID, alt: "New style" }],
    });

    expect(db.updated[0]!.styleRef).toEqual([
      {
        url: `https://res.cloudinary.com/test-cloud/image/upload/${PHOTO_PUBLIC_ID}.jpg`,
        publicId: PHOTO_PUBLIC_ID,
        alt: "New style",
      },
    ]);
    expect(cloud.verified).toEqual([PHOTO_PUBLIC_ID]);
    // The replaced photo is handed to the queue, not deleted while the client waits.
    expect(cleanup.enqueued).toEqual([OLD_PHOTO_PUBLIC_ID]);
    expect(cloud.destroyed).toEqual([]);
  });

  it("treats an empty photo list as 'leave the photos alone'", async () => {
    const { db, cleanup } = await buildApp({
      db: { rowsByTable: { jobs: [jobRow({ finishedJob: [] })] } },
    });

    await send("PATCH", `/api/v1/jobs/${JOB_ID}`, {
      styleRef: [],
      description: "Adjusted",
    });

    expect(db.updated).toEqual([{ description: "Adjusted" }]);
    // Nothing was released just because a client sent `[]`.
    expect(cleanup.enqueued).toEqual([]);
  });

  it("returns 400 for a patch with no fields", async () => {
    const { db } = await buildApp();

    const response = await send("PATCH", `/api/v1/jobs/${JOB_ID}`, {});

    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { field: "", message: "Provide at least one field to update" },
    ]);
    expect(db.calls).toEqual([]);
  });
});

describe("DELETE /api/v1/jobs/:id", () => {
  it("locks the job row, deletes it, then queues its photos for release", async () => {
    const { db, cloud, cleanup } = await buildApp({
      db: {
        rowsByTable: {
          jobs: [
            jobDetailRow({
              styleRef: [{ url: "u1", publicId: "hollyseams/photos/a", alt: "a" }],
              finishedJob: [{ url: "u2", publicId: "hollyseams/photos/b", alt: "b" }],
            }),
          ],
          payments: [],
        },
      },
    });

    const response = await send("DELETE", `/api/v1/jobs/${JOB_ID}`);

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBe("Job deleted successfully");

    // The lock is what makes the "no payments" check conclusive against a concurrent
    // `createPayment`, which takes the same lock on the same row.
    expect(db.calls).toContain("transaction");
    expect(db.calls).toContain("for:update");
    expect(db.calls).toContain("delete:jobs");
    // Both photos are queued only after the delete, and the request does not wait on the
    // provider to release them.
    expect(cleanup.enqueued).toEqual(["hollyseams/photos/a", "hollyseams/photos/b"]);
    expect(cloud.destroyed).toEqual([]);
  });

  it("refuses with 409 when the job has payments, and releases nothing", async () => {
    const { db, cleanup } = await buildApp({
      db: {
        rowsByTable: {
          jobs: [jobDetailRow({ styleRef: [{ url: "u1", publicId: "p1", alt: "a" }] })],
          payments: [paymentRow()],
        },
      },
    });

    const response = await send("DELETE", `/api/v1/jobs/${JOB_ID}`);

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe(
      "Job has payments and cannot be deleted",
    );
    expect(cleanup.enqueued).toEqual([]);
    // The transaction rolled back, so no DELETE reached the database.
    expect(db.calls).not.toContain("delete:jobs");
  });

  it("returns 404 when the job does not exist", async () => {
    await buildApp({ db: { rowsByTable: { jobs: [], payments: [] } } });

    const response = await send("DELETE", `/api/v1/jobs/${MISSING_ID}`);

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe("Job not found");
  });
});

describe("POST /api/v1/jobs/:jobId/payments", () => {
  /** Every payment request now carries the intent's key; these tests are about what it does. */
  const pay = (payload: unknown, key: string = PAYMENT_KEY) =>
    send("POST", `/api/v1/jobs/${JOB_ID}/payments`, payload, {
      "idempotency-key": key,
    });

  it("inserts the payment with its key, while holding an update lock on the job", async () => {
    const { db } = await buildApp({
      db: {
        rowsByTable: {
          jobs: [{ id: JOB_ID }],
          payments: [paymentRow()],
        },
        rowSequences: {
          // The fake does not evaluate predicates, so "no row with this key exists yet" is
          // scripted: the replay read looks and finds nothing, then the insert runs.
          payments: [[]],
        },
      },
    });

    const response = await pay({ amount: 50, paidAt: "2026-02-01" });

    expect(response.statusCode).toBe(201);
    expect(response.json().message).toBe("Payment created successfully");
    // The key is part of the row that *is* the effect, not a separate bookkeeping insert, so
    // key and payment commit or roll back together.
    expect(db.inserted[0]).toMatchObject({
      jobId: JOB_ID,
      amount: 50,
      paidAt: new Date("2026-02-01T00:00:00.000Z"),
      idempotencyKey: PAYMENT_KEY,
    });
    // Conflict-safe insert rather than check-then-act: `ON CONFLICT DO NOTHING` on the key
    // column is what reduces two concurrent deliveries to one payment.
    expect(db.calls).toContain("onConflict:idempotency_key");
    // The lock is the point of the transaction, and it sits on a row this method never writes: it
    // is what makes `delete`'s "no payments" check wait for this insert (§19.2).
    expect(db.calls).toContain("for:update");
    expect(db.calls).not.toContain("for:share");
  });

  it("replays the recorded payment for the same key, without touching the job", async () => {
    const { db } = await buildApp({
      db: {
        rowsByTable: {
          // Deliberately empty: a replay of an intent that already committed must not need the
          // job row and must not take its lock.
          jobs: [],
          payments: [paymentRow({ idempotencyKey: PAYMENT_KEY })],
        },
      },
    });

    const response = await pay({ amount: 50, paidAt: "2026-02-01" });

    expect(response.statusCode).toBe(201);
    // Same status and same body as the first delivery — the client needs no special case...
    expect(response.json().data.id).toBe(PAYMENT_ID);
    // ...and the server says what happened out loud, for anyone debugging a double delivery.
    expect(response.headers["idempotent-replay"]).toBe("true");

    expect(db.inserted).toEqual([]);
    expect(db.calls).not.toContain("for:update");
  });

  it("returns the winner's payment when a concurrent delivery takes the key mid-flight", async () => {
    const { db } = await buildApp({
      db: {
        rowsByTable: {
          jobs: [{ id: JOB_ID }],
          // What the INSERT sees: the key is already taken, so `ON CONFLICT DO NOTHING`
          // inserts zero rows — exactly what the second of two concurrent deliveries gets.
          payments: [],
        },
        rowSequences: {
          // The same table answers twice: "not recorded yet" to the first read, then the row the
          // winning request committed, to the read after the insert loses the race.
          payments: [[], [paymentRow({ idempotencyKey: PAYMENT_KEY })]],
        },
      },
    });

    const response = await pay({ amount: 50, paidAt: "2026-02-01" });

    expect(response.statusCode).toBe(201);
    expect(response.headers["idempotent-replay"]).toBe("true");
    expect(response.json().data.id).toBe(PAYMENT_ID);
    // One insert attempt, and it was conflict-tolerant: the unique index decided the race, not
    // the read that preceded it.
    expect(db.inserted).toHaveLength(1);
    expect(db.calls).toContain("onConflict:idempotency_key");
  });

  it("refuses a key that was already used for a different payment", async () => {
    const { db } = await buildApp({
      db: {
        rowsByTable: {
          jobs: [{ id: JOB_ID }],
          payments: [paymentRow({ idempotencyKey: PAYMENT_KEY })],
        },
      },
    });

    const response = await pay({ amount: 75, paidAt: "2026-02-01" });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe(
      "Idempotency-Key was already used for a different payment",
    );
    // Returning the recorded 50 as if the 75 had been accepted would be worse than an error.
    expect(db.inserted).toEqual([]);
    expect(db.calls).not.toContain("for:update");
  });

  it("requires a UUID Idempotency-Key before anything reaches the database", async () => {
    const { db } = await buildApp();

    const missing = await send("POST", `/api/v1/jobs/${JOB_ID}/payments`, {
      amount: 50,
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().message).toBe("Invalid Idempotency-Key header");
    expect(missing.json().errors).toEqual([
      {
        field: "Idempotency-Key",
        message: "Idempotency-Key header is required",
      },
    ]);

    const malformed = await pay({ amount: 50 }, "not-a-uuid");
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().errors).toEqual([
      {
        field: "Idempotency-Key",
        message: "Idempotency-Key header must be a UUID",
      },
    ]);

    expect(db.calls).toEqual([]);
  });

  it("returns 404 for an unknown job and 400 for a non-positive amount", async () => {
    const { db } = await buildApp({
      db: { rowsByTable: { jobs: [], payments: [] } },
    });

    const unknownJob = await pay({ amount: 50 });
    expect(unknownJob.statusCode).toBe(404);
    expect(unknownJob.json().message).toBe("Job not found");

    await buildApp();
    const zero = await pay({ amount: 0 });
    expect(zero.statusCode).toBe(400);
    expect(zero.json().errors).toEqual([
      { field: "amount", message: "Payment amount must be greater than zero" },
    ]);
    expect(db.calls).not.toContain("into:payments");
  });
});
