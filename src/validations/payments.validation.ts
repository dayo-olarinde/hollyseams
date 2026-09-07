import { z } from "zod";

/**
 * payments.amount is numeric(12, 2) — same cap as jobs.agreedPrice.
 * A payment must be strictly positive; use the job PATCH endpoint to
 * adjust pricing, not a zero-valued payment.
 */
const paymentAmountSchema = z.coerce
  .number()
  .finite("Payment amount must be a finite number")
  .positive("Payment amount must be greater than zero")
  .max(9999999999.99, "Payment amount must be at most 9999999999.99");

/** POST /api/v1/jobs/:jobId/payments — record a payment against an existing job. */
export const createPaymentSchema = z.strictObject({
  amount: paymentAmountSchema,
  // Defaults to "now"; pass an ISO date string to backdate a payment.
  paidAt: z.coerce.date().default(() => new Date()),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
