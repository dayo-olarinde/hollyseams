import { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ApiError } from "../src/common/http/api-response";
import { keysetCondition, pageRows, splitCursor } from "../src/common/pagination/cursor";
import { listQuerySchema } from "../src/common/validation/list-query.schema";
import { customersTable } from "../src/database";

/**
 * Unit tests for the shared pagination helpers and the list query schema.
 *
 * Express bridge: these are `tests/cursor.test.ts` from the Express app, pointed at the new
 * locations. Nothing about the logic changed, so nothing about the tests changed — which is
 * exactly the point: code with no framework dependencies migrates by copy and re-point.
 *
 * These tests need no Nest, no database, and no DI: they call plain functions. That is why
 * they are fast and why they are the first line of defence for cursor parsing.
 */
const collectLeaves = (node: unknown): string[] => {
  if (node === null || node === undefined) return [];
  if (typeof node !== "object") return [String(node)];
  if (node instanceof SQL) return collectLeaves(node.queryChunks);
  if (Array.isArray(node)) return node.flatMap(collectLeaves);
  const value = (node as { value?: unknown }).value;
  if (Array.isArray(value)) return collectLeaves(value);
  if (Object.getPrototypeOf(node) === Object.prototype) {
    return Object.values(node).flatMap(collectLeaves);
  }
  return [];
};

const UUID = "2ac99efd-84ad-46aa-b5d5-3605cd98e4a7";

describe("splitCursor", () => {
  it("splits at the LAST separator, so values may contain pipes", () => {
    expect(splitCursor(`Ada|Lovelace|${UUID}`)).toEqual({
      value: "Ada|Lovelace",
      id: UUID,
    });
  });

  it("rejects a cursor ending in a separator (empty id)", () => {
    expect(() => splitCursor("2026-09-08T10:00:00.000Z|")).toThrow(ApiError);
  });

  it("parses a normal cursor", () => {
    expect(splitCursor(`2026-09-08T10:00:00.000Z|${UUID}`)).toEqual({
      value: "2026-09-08T10:00:00.000Z",
      id: UUID,
    });
  });

  it("rejects a cursor with no separator", () => {
    expect(() => splitCursor("garbage")).toThrow(ApiError);
    expect(() => splitCursor("garbage")).toThrow("Invalid pagination cursor");
  });

  it("rejects a cursor whose id is not a uuid", () => {
    expect(() => splitCursor(`2026-09-08T10:00:00.000Z|not-a-uuid`)).toThrow(
      ApiError,
    );
  });

  it("rejects an empty value half", () => {
    expect(() => splitCursor(`|${UUID}`)).toThrow(ApiError);
  });
});

describe("keysetCondition", () => {
  it("builds a row-wise comparison for name-ascending lists", () => {
    const leaves = collectLeaves(
      keysetCondition(
        customersTable.name,
        customersTable.id,
        `Zainab|${UUID}`,
        "text",
        ">",
      ).queryChunks,
    ).join(" ");

    // The comparison is `(sort, id) > (value, id)` — never the sort column alone.
    expect(leaves).toContain(">");
    expect(leaves).toContain(UUID);
    expect(leaves).toContain("Zainab");
  });

  it("casts timestamp cursor values so Postgres compares them as timestamps", () => {
    const leaves = collectLeaves(
      keysetCondition(
        customersTable.createdAt,
        customersTable.id,
        `2026-09-08T10:00:00.000Z|${UUID}`,
        "timestamptz",
        "<",
      ).queryChunks,
    ).join(" ");

    expect(leaves).toContain("<");
    expect(leaves).toContain("::timestamptz");
  });

  it("rejects a non-date value in timestamptz mode", () => {
    expect(() =>
      keysetCondition(
        customersTable.createdAt,
        customersTable.id,
        `not-a-date|${UUID}`,
        "timestamptz",
        "<",
      ),
    ).toThrow(ApiError);
  });

  it("accepts any text value in text mode", () => {
    const leaves = collectLeaves(
      keysetCondition(
        customersTable.name,
        customersTable.id,
        `Zainab|${UUID}`,
        "text",
        ">",
      ).queryChunks,
    ).join(" ");

    expect(leaves).not.toContain("::timestamptz");
  });

  it("accepts numeric values for aggregate report cursors", () => {
    const leaves = collectLeaves(
      keysetCondition(
        customersTable.id,
        customersTable.id,
        `1250.50|${UUID}`,
        "numeric",
        "<",
      ).queryChunks,
    ).join(" ");

    expect(leaves).toContain("::numeric");
  });

  it("rejects non-numeric aggregate cursor values", () => {
    expect(() =>
      keysetCondition(
        customersTable.id,
        customersTable.id,
        `not-a-number|${UUID}`,
        "numeric",
        "<",
      ),
    ).toThrow(ApiError);
  });
});

describe("pageRows", () => {
  it("keeps the extra row out of the page but reports that more exist", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

    const { items, hasMore, last } = pageRows(rows, 2);

    expect(items).toEqual([{ id: "a" }, { id: "b" }]);
    expect(hasMore).toBe(true);
    expect(last).toEqual({ id: "b" });
  });

  it("reports the end of the list when the extra row is absent", () => {
    const { items, hasMore, last } = pageRows([{ id: "a" }], 2);

    expect(items).toEqual([{ id: "a" }]);
    expect(hasMore).toBe(false);
    expect(last).toEqual({ id: "a" });
  });

  it("returns an undefined last row for an empty result", () => {
    expect(pageRows([], 10)).toEqual({
      items: [],
      hasMore: false,
      last: undefined,
    });
  });
});

describe("listQuerySchema", () => {
  it("defaults limit to ten and leaves cursor undefined", () => {
    expect(listQuerySchema.parse({})).toEqual({ limit: 10 });
  });

  it("coerces the string limit that arrives from a query string", () => {
    expect(listQuerySchema.parse({ limit: "5" })).toEqual({ limit: 5 });
  });

  it("rejects out-of-range and fractional limits", () => {
    expect(listQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(listQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(listQuerySchema.safeParse({ limit: "2.5" }).success).toBe(false);
  });

  it("rejects unknown keys and oversized cursors", () => {
    expect(listQuerySchema.safeParse({ limit: "5", page: "2" }).success).toBe(
      false,
    );
    expect(
      listQuerySchema.safeParse({ cursor: "x".repeat(201) }).success,
    ).toBe(false);
  });
});
