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
  type FakePgClient,
  type FakePgOptions,
} from "./helpers/fakes";

/**
 * In-process HTTP tests for the reports endpoints.
 *
 * What is different from the other feature suites: these three routes never touch Drizzle.
 * They send raw SQL through `PG_CLIENT`, so the database double reads the statement it is
 * handed (`onQuery`) and answers it, and `pg.queries` records what was sent. That recording is
 * how the tests below prove a *particular* query still runs — these aggregates were ported
 * verbatim from the Express app, and a rewrite that returned the same shape would otherwise go
 * unnoticed.
 */
const USER_ID = "3f1c2b1a-9d4e-4f6a-8b2c-1d2e3f4a5b6c";
const SESSION_ID = "test-session";

/**
 * A month row. Built from *local* date parts on purpose: the service formats `monthKey` from
 * local getters (matching Express), so a `new Date("2026-03-01T00:00:00Z")` fixture would
 * produce "2026-02" on a machine west of UTC and make this suite depend on the runner's clock.
 */
const monthlyRow = (year: number, monthIndex: number, revenue: string, running: string) => ({
  month: new Date(year, monthIndex, 1),
  revenue,
  running_total: running,
});

const topCustomerRow = (
  id: string,
  name: string,
  totalPaid: string,
  jobCount: string,
  phoneNumber: string | null = null,
) => ({
  id,
  name,
  phone_number: phoneNumber,
  total_paid: totalPaid,
  job_count: jobCount,
});

const outstandingRow = () => ({
  job_id: "a2f0f0aa-1111-4222-8333-444455556666",
  customer_id: "5596e755-1c3b-4559-b22f-2b502d0a1cb7",
  customer_name: "Ada Obi",
  subject_name: "Chidi Obi",
  description: "Two-piece suit",
  status: "in_progress",
  due_date: new Date("2026-04-01T00:00:00.000Z"),
  agreed_price: "45000",
  total_paid: "15000",
  balance_due: "30000",
});

let app: NestFastifyApplication | undefined;

const buildApp = async (options: FakePgOptions = {}): Promise<FakePgClient> => {
  const db = fakeQueryDb();
  const pg = fakePgClient(options);
  const redis = new FakeRedis({
    seed: { [`session:${SESSION_ID}`]: JSON.stringify({ id: USER_ID }) },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(REDIS)
    .useValue(redis)
    .overrideProvider(DRIZZLE)
    .useValue(db.db)
    .overrideProvider(PG_CLIENT)
    .useValue(pg)
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

  return pg;
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

describe("reports authentication", () => {
  it("protects all three reports", async () => {
    await buildApp();

    const responses = await Promise.all([
      get("/api/v1/reports/monthly-revenue", false),
      get("/api/v1/reports/top-customers", false),
      get("/api/v1/reports/outstanding-payments", false),
    ]);

    expect(responses.map((r) => r.statusCode)).toEqual([401, 401, 401]);
    expect(responses[0]!.json().message).toBe("Not authenticated");
  });
});

describe("GET /api/v1/reports/monthly-revenue", () => {
  it("returns the running total and formats each month", async () => {
    const rows = [
      monthlyRow(2026, 0, "12000", "12000"),
      monthlyRow(2026, 1, "8000.50", "20000.50"),
    ];
    await buildApp({ onQuery: () => rows });

    const response = await get("/api/v1/reports/monthly-revenue");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: "Monthly revenue retrieved",
      data: [
        { monthKey: "2026-01", month: "January 2026", revenue: 12000, runningTotal: 12000 },
        { monthKey: "2026-02", month: "February 2026", revenue: 8000.5, runningTotal: 20000.5 },
      ],
    });

    // Postgres `numeric` arrives as a string; the numbers above only exist because the mapper
    // converts them. Without `Number(...)` a client would receive "12000" and add strings.
    expect(typeof response.json().data[0].revenue).toBe("number");
  });

  it("still runs the ported CTE with its window function", async () => {
    const pg = await buildApp({ onQuery: () => [] });

    await get("/api/v1/reports/monthly-revenue");

    const [query] = pg.queries;
    expect(query!.sql).toContain("date_trunc('month', paid_at)");
    expect(query!.sql).toContain("sum(revenue) over (order by month asc)");
    // No parameters: this report takes no input, so nothing can be injected through it.
    expect(query!.params).toEqual([]);
  });
});

describe("GET /api/v1/reports/top-customers", () => {
  it("defaults limit to 10 and passes it to Postgres as a parameter", async () => {
    const pg = await buildApp({ onQuery: () => [] });

    await get("/api/v1/reports/top-customers");

    const [query] = pg.queries;
    // `?` marks where the interpolated value goes: the tagged template parameterizes, it does
    // not paste the number into the SQL text.
    expect(query!.sql).toContain("limit ?");
    expect(query!.params).toEqual([10]);
  });

  it("passes an explicit limit through as a number", async () => {
    const pg = await buildApp({ onQuery: () => [] });

    await get("/api/v1/reports/top-customers?limit=3");

    expect(pg.queries[0]!.params).toEqual([3]);
  });

  it("returns the mapping the client expects, with numbers not numeric strings", async () => {
    const rows = [topCustomerRow("c-1", "Ada Obi", "45000", "2", "+2348000000000")];
    await buildApp({ onQuery: () => rows });

    const response = await get("/api/v1/reports/top-customers?limit=5");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: "Top customers retrieved",
      data: [
        {
          id: "c-1",
          name: "Ada Obi",
          phoneNumber: "+2348000000000",
          totalPaid: 45000,
          jobCount: 2,
        },
      ],
    });
  });

  it("counts distinct jobs, not payments", async () => {
    const pg = await buildApp({ onQuery: () => [] });

    await get("/api/v1/reports/top-customers");

    // A job paid in three instalments is one job; without `distinct` it would count three times.
    expect(pg.queries[0]!.sql).toContain("count(distinct p.job_id)");
    expect(pg.queries[0]!.sql).toContain("order by total_paid desc");
  });

  it("rejects a limit above the maximum before any query runs", async () => {
    const pg = await buildApp();

    const response = await get("/api/v1/reports/top-customers?limit=101");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: "Invalid query parameters",
      errors: [{ field: "limit", message: "Limit must be at most 100" }],
    });
    expect(pg.queries).toEqual([]);
  });

  it("rejects a misspelled parameter instead of silently using the default", async () => {
    await buildApp();

    const response = await get("/api/v1/reports/top-customers?limt=5");

    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { field: "", message: 'Unrecognized key: "limt"' },
    ]);
  });
});

describe("GET /api/v1/reports/outstanding-payments", () => {
  it("nests the customer, converts money and leaves the date as an ISO string", async () => {
    await buildApp({ onQuery: () => [outstandingRow()] });

    const response = await get("/api/v1/reports/outstanding-payments");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: "Outstanding payments retrieved",
      data: [
        {
          jobId: "a2f0f0aa-1111-4222-8333-444455556666",
          customer: { id: "5596e755-1c3b-4559-b22f-2b502d0a1cb7", name: "Ada Obi" },
          subjectName: "Chidi Obi",
          description: "Two-piece suit",
          status: "in_progress",
          dueDate: "2026-04-01T00:00:00.000Z",
          agreedPrice: 45000,
          totalPaid: 15000,
          balanceDue: 30000,
        },
      ],
    });
  });

  it("keeps the left join and the aggregate filter", async () => {
    const pg = await buildApp({ onQuery: () => [] });

    await get("/api/v1/reports/outstanding-payments");

    // `left join` is what keeps a job with no payments yet in the report, and `having` is the
    // only clause that can filter on an aggregate — `where` runs before the grouping.
    expect(pg.queries[0]!.sql).toContain("left join payments p on p.job_id = j.id");
    expect(pg.queries[0]!.sql).toContain("having");
  });
});
