import { describe, expect, it } from "vitest";
import { SQL } from "drizzle-orm";
import { keysetCondition, splitCursor } from "../src/utils/cursor";
import { ApiError } from "../src/utils/apiResponse";
import { jobsTable } from "../src/db";
import {} from "../src/validations/jobs.validation";
import { listItemsQuerySchema } from "../src/validations/customers.validation";

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

describe("splitCursor", () => {
  it("splits at the LAST separator, so values may contain pipes", () => {
    const id = "2ac99efd-84ad-46aa-b5d5-3605cd98e4a7";
    expect(splitCursor(`Ada|Lovelace|${id}`)).toEqual({
      value: "Ada|Lovelace",
      id,
    });
  });

  it("rejects a cursor ending in a separator (empty id)", () => {
    expect(() => splitCursor("2026-09-08T10:00:00.000Z|")).toThrow(ApiError);
  });

  it("parses a normal cursor", () => {
    const id = "2ac99efd-84ad-46aa-b5d5-3605cd98e4a7";
    expect(splitCursor(`2026-09-08T10:00:00.000Z|${id}`)).toEqual({
      value: "2026-09-08T10:00:00.000Z",
      id,
    });
  });

  it("rejects a cursor with no separator", () => {
    expect(() => splitCursor("garbage")).toThrow(ApiError);
    expect(() => splitCursor("garbage")).toThrow("Invalid pagination cursor");
  });

  it("rejects a cursor whose id is not a uuid", () => {
    expect(() => splitCursor("2026-09-08T10:00:00.000Z|not-a-uuid")).toThrow(
      ApiError,
    );
  });

  it("rejects an empty value half", () => {
    expect(() => splitCursor("|2ac99efd-84ad-46aa-b5d5-3605cd98e4a7")).toThrow(
      ApiError,
    );
  });
});

describe("keysetCondition", () => {
  it("builds a row-wise comparison for DESC lists", () => {
    const id = "2ac99efd-84ad-46aa-b5d5-3605cd98e4a7";
    const condition = keysetCondition(
      jobsTable.createdAt,
      jobsTable.id,
      `2026-09-08T10:00:00.000Z|${id}`,
      "timestamptz",
      "<",
    );

    const leaves = collectLeaves(condition.queryChunks).join(" ");

    expect(leaves).toContain("<");
    expect(leaves).toContain("::timestamptz");
    expect(leaves).toContain(id);
    expect(leaves).toContain("2026-09-08T10:00:00.000Z");
  });

  it("rejects a non-date value in timestamptz mode", () => {
    expect(() =>
      keysetCondition(
        jobsTable.createdAt,
        jobsTable.id,
        "not-a-date|2ac99efd-84ad-46aa-b5d5-3605cd98e4a7",
        "timestamptz",
        "<",
      ),
    ).toThrow(ApiError);
  });

  it("accepts any text value in text mode", () => {
    const condition = keysetCondition(
      jobsTable.id,
      jobsTable.id,
      "Zainab|2ac99efd-84ad-46aa-b5d5-3605cd98e4a7",
      "text",
      ">",
    );

    expect(collectLeaves(condition.queryChunks).join(" ")).not.toContain(
      "::timestamptz",
    );
  });
});

describe("pagination query schemas", () => {
  it("defaults limit and leaves cursor undefined", () => {
    const jobs = listItemsQuerySchema.parse({});
    expect(jobs).toEqual({ limit: 10 });

    const customers = listItemsQuerySchema.parse({});
    expect(customers).toEqual({ limit: 20 });
  });

  it("coerces string limits from the query string", () => {
    expect(listItemsQuerySchema.parse({ limit: "5" })).toEqual({ limit: 5 });
  });

  it("rejects out-of-range and fractional limits", () => {
    expect(listItemsQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(listItemsQuerySchema.safeParse({ limit: "101" }).success).toBe(
      false,
    );
    expect(listItemsQuerySchema.safeParse({ limit: "2.5" }).success).toBe(
      false,
    );
  });

  it("rejects unknown keys and oversized cursors", () => {
    expect(
      listItemsQuerySchema.safeParse({ limit: "5", page: "2" }).success,
    ).toBe(false);
    expect(
      listItemsQuerySchema.safeParse({ cursor: "x".repeat(201) }).success,
    ).toBe(false);
  });
});
