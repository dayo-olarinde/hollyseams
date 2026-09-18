import { z } from "zod";

/**
 * The page-size rule, defined once and reused by every endpoint that accepts `limit`
 * (customers, subjects, measurements, jobs and the top-customers report). Copying it per
 * feature is how a maximum ends up being 100 in one place and 50 in another.
 *
 * `coerce` because a query string is text — `?limit=10` arrives as `"10"`. The default
 * applies only when the key is absent, so `?limit=` (empty) is a 400 rather than a silent 10.
 */
export const limitField = z.coerce
  .number()
  .int("Limit must be a whole number")
  .positive("Limit must be at least 1")
  .max(100, "Limit must be at most 100")
  .default(10);

export const listQuerySchema = z.strictObject({
  limit: limitField,
  cursor: z.string().trim().min(1).max(200).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
