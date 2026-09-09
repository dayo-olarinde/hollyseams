import { z } from "zod";

export const idParamsSchema = z.strictObject({
  id: z.uuid("Invalid id"),
});

export const jobIdParamsSchema = z.strictObject({
  jobId: z.uuid("Invalid job id"),
});

export type IdParams = z.infer<typeof idParamsSchema>;
export type JobIdParams = z.infer<typeof jobIdParamsSchema>;
