import { and, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { keysetCondition } from "../src/common/pagination/cursor";
import { jobsTable } from "../src/database";
import { jobStatusFilterCondition } from "../src/modules/jobs/job-status-filter";

/**
 * The status filter builds Drizzle SQL, so it can be asserted without a database: `PgDialect`
 * serializes a condition to the SQL text plus its bound params — the same pipeline the postgres
 * driver uses. This is a port of `backend/tests/jobs-filter.test.ts`, unchanged in substance.
 *
 * Express bridge: the Express test imported `jobStatusFilterCondition` from `utils/jobs-filter`;
 * the only change is the import path, because the helper now lives inside the jobs feature.
 */
const dialect = new PgDialect();

const render = (sql: SQL) => {
  const { sql: text, params } = dialect.sqlToQuery(sql);
  return { text, params, combined: `${text} ${params.join(" ")}` };
};

const UUID = "2ac99efd-84ad-46aa-b5d5-3605cd98e4a7";
const CURSOR = `2026-09-08T10:00:00.000Z|${UUID}`;

describe("jobStatusFilterCondition", () => {
  it("returns undefined when no status filter is given (All)", () => {
    // `undefined` is what lets the caller pass this straight into `and(...)`.
    expect(jobStatusFilterCondition(undefined)).toBeUndefined();
  });

  it("pending filters on status = 'pending' only", () => {
    const { text, combined } = render(jobStatusFilterCondition("pending")!);

    expect(combined).toContain("pending");
    expect(text).toContain("status");
    expect(text).toContain("=");
    // pending says nothing about delivery — no delivered_at null check.
    expect(text).not.toContain("delivered_at");
  });

  it("completed filters on completed jobs that are NOT yet delivered", () => {
    const { text, combined } = render(jobStatusFilterCondition("completed")!);

    expect(combined).toContain("completed");
    expect(text).toContain("delivered_at");
    expect(text).toContain("is null");
  });

  it("delivered filters on completed jobs WITH a delivered_at timestamp", () => {
    const { text, combined } = render(jobStatusFilterCondition("delivered")!);

    expect(combined).toContain("completed");
    expect(text).toContain("delivered_at");
    expect(text).toContain("is not null");
    // "is not null" is the only null-check — a delivered job is never is null.
    expect(text.replace("is not null", "")).not.toContain("is null");
  });
});

describe("status filter composes with cursor pagination", () => {
  it.each(["pending", "completed", "delivered"] as const)(
    "%s pages within its filtered subset, newest first",
    (status) => {
      // Both conditions are defined here, so `and()` always returns a condition.
      const { text, combined } = render(
        and(
          jobStatusFilterCondition(status)!,
          keysetCondition(jobsTable.createdAt, jobsTable.id, CURSOR),
        )!,
      );

      // The status filter is applied…
      if (status === "pending") {
        expect(combined).toContain("pending");
        expect(text).not.toContain("delivered_at");
      } else {
        expect(combined).toContain("completed");
        expect(text).toContain(
          status === "completed" ? "is null" : "is not null",
        );
      }

      // …and the keyset cursor still walks (created_at, id) DESC within it.
      expect(text).toContain("created_at");
      expect(text).toContain("<");
      expect(text).toContain("::timestamptz");
      expect(combined).toContain("2026-09-08T10:00:00.000Z");
      expect(combined).toContain(UUID);
    },
  );
});
