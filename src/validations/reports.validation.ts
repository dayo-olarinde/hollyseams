import { z } from "zod";

export const topCustomersQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int("Limit must be a whole number")
    .positive("Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(10),
});

export type TopCustomersQuery = z.infer<typeof topCustomersQuerySchema>;
