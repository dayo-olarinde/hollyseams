import { z } from "zod";

/** Shared validator for every `/:id` route param (customers, subjects, jobs). */
export const idParamsSchema = z.strictObject({
  id: z.uuid("Invalid id"),
});

/** Param schema for routes scoped under a specific job, e.g. /jobs/:jobId/payments. */
export const jobIdParamsSchema = z.strictObject({
  jobId: z.uuid("Invalid job id"),
});

export type IdParams = z.infer<typeof idParamsSchema>;
export type JobIdParams = z.infer<typeof jobIdParamsSchema>;
