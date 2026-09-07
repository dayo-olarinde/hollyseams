import { describe, expect, it } from "vitest";
import { createPaymentSchema } from "../src/validations/payments.validation";

describe("createPaymentSchema", () => {
  it("accepts an amount and defaults paidAt to now", () => {
    const result = createPaymentSchema.parse({ amount: 2500 });

    expect(result.amount).toBe(2500);
    expect(result.paidAt).toBeInstanceOf(Date);
  });

  it("accepts a backdated paidAt", () => {
    const result = createPaymentSchema.parse({
      amount: 2500,
      paidAt: "2026-01-15",
    });

    expect(result.paidAt).toBeInstanceOf(Date);
    expect(result.paidAt.toISOString().startsWith("2026-01-15")).toBe(true);
  });

  it("rejects a zero amount", () => {
    const result = createPaymentSchema.safeParse({ amount: 0 });

    expect(result.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const result = createPaymentSchema.safeParse({ amount: -500 });

    expect(result.success).toBe(false);
  });

  it("rejects an amount above the numeric(12,2) column cap", () => {
    const result = createPaymentSchema.safeParse({ amount: 10000000000 });

    expect(result.success).toBe(false);
  });

  it("rejects unknown keys", () => {
    const result = createPaymentSchema.safeParse({
      amount: 2500,
      method: "transfer",
    });

    expect(result.success).toBe(false);
  });
});
