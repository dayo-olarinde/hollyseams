import { describe, expect, it } from "vitest";
import { topCustomersQuerySchema } from "../src/validations/reports.validation";

describe("topCustomersQuerySchema", () => {
  it("defaults limit to 10", () => {
    expect(topCustomersQuerySchema.parse({}).limit).toBe(10);
  });

  it("coerces the query-string number", () => {
    expect(topCustomersQuerySchema.parse({ limit: "5" }).limit).toBe(5);
  });

  it("rejects a zero or negative limit", () => {
    expect(topCustomersQuerySchema.safeParse({ limit: "0" }).success).toBe(
      false,
    );
    expect(topCustomersQuerySchema.safeParse({ limit: "-3" }).success).toBe(
      false,
    );
  });

  it("rejects a limit above 100", () => {
    expect(topCustomersQuerySchema.safeParse({ limit: "101" }).success).toBe(
      false,
    );
  });

  it("rejects a non-numeric limit", () => {
    expect(topCustomersQuerySchema.safeParse({ limit: "most" }).success).toBe(
      false,
    );
  });

  it("rejects unknown query keys", () => {
    expect(
      topCustomersQuerySchema.safeParse({ limit: "5", sort: "name" }).success,
    ).toBe(false);
  });
});
