import { z } from "zod";

const paymentAmountSchema = z.coerce
  .number()
  .finite("Payment amount must be a finite number")
  .positive("Payment amount must be greater than zero")
  .max(9999999999.99, "Payment amount must be at most 9999999999.99");

export const createPaymentSchema = z.strictObject({
  amount: paymentAmountSchema,
  paidAt: z.coerce.date().default(() => new Date()),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
