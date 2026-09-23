import { z } from "zod";

export const createPaymentSchema = z.strictObject({
  amount: z.coerce
    .number()
    .finite("Payment amount must be a finite number")
    .positive("Payment amount must be greater than zero")
    .max(9999999999.99, "Payment amount must be at most 9999999999.99"),
  paidAt: z.coerce.date().default(() => new Date()),
});

export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;

export const idempotencyKeySchema = z.uuid({
  error: (issue) =>
    issue.input === undefined
      ? "Idempotency-Key header is required"
      : "Idempotency-Key header must be a UUID",
});

export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;
