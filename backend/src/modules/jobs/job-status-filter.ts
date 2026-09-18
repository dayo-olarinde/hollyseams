import { and, eq, isNotNull, isNull, type SQL } from "drizzle-orm";

import { jobsTable } from "../../database";

// const: These are fixed allowed values.
export const JOB_STATUS_FILTERS = [
  "pending",
  "completed",
  "delivered",
] as const;

// Give me the type of any element in this array.
export type JobStatusFilter = (typeof JOB_STATUS_FILTERS)[number];

export const jobStatusFilterCondition = (
  status?: JobStatusFilter,
): SQL | undefined => {
  switch (status) {
    case "pending":
      return eq(jobsTable.status, "pending");
    case "completed":
      return and(
        eq(jobsTable.status, "completed"),
        isNull(jobsTable.deliveredAt),
      );
    case "delivered":
      return and(
        eq(jobsTable.status, "completed"),
        isNotNull(jobsTable.deliveredAt),
      );
    default:
      return undefined;
  }
};
