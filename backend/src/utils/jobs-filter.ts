import { and, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { jobsTable } from "../db";

/**
 * The statuses the list endpoints can filter by. There is deliberately no
 * "canceled" value: canceled jobs only appear under "All" (no status param).
 */
export const JOB_STATUS_FILTERS = ["pending", "completed", "delivered"] as const;
export type JobStatusFilter = (typeof JOB_STATUS_FILTERS)[number];

/**
 * Maps the ?status= query filter to SQL conditions for the jobs table.
 *
 * The schema has no literal "delivered" status — a job is delivered when
 * status is "completed" AND delivered_at is set (the same derivation the
 * dashboard uses). So "completed" means completed and NOT yet delivered
 * (ready for pickup), while "delivered" is completed with a delivered_at.
 * "pending" is a plain status match.
 *
 * Returns undefined for no filter ("All"), so callers can compose it with
 * keyset pagination via `and(...)`.
 */
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