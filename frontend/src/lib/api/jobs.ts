import type { PaginationMeta } from "@/types/api";
import type {
  CreateJobForSubjectInput,
  CreateJobInput,
  CreatePaymentInput,
  Job,
  JobCounts,
  JobsQuery,
  Payment,
  UpdateJobInput,
} from "@/types/job";
import { request } from "./transport";

export async function listJobs(params?: JobsQuery, signal?: AbortSignal) {
  return request<Job[], PaginationMeta>({ url: "/jobs", params, signal });
}

export async function listCustomerJobs(
  customerId: string,
  params?: JobsQuery,
  signal?: AbortSignal,
) {
  return request<Job[], PaginationMeta>({
    url: `/customers/${customerId}/jobs`,
    params,
    signal,
  });
}

/**
 * The four numbers under the status tabs, aggregated in Postgres.
 *
 * The client cannot derive these. `GET /jobs` is keyset-paginated, so a page of ten says nothing
 * about the total, and the previous approach — download `limit=100` and count in the browser —
 * both wasted a hundred rows on the dashboard and the Jobs tab *and* silently under-reported
 * once the studio passed 100 jobs. One small request answers it exactly.
 */
export async function getJobCounts(signal?: AbortSignal) {
  return request<JobCounts>({ url: "/jobs/counts", signal });
}

export async function getJob(id: string, signal?: AbortSignal) {
  return request<Job>({ url: `/jobs/${id}`, signal });
}

export async function createJob(input: CreateJobInput) {
  return request<Job>({
    url: "/jobs/new-customer",
    method: "POST",
    data: input,
  });
}

export async function createJobForSubject(
  subjectId: string,
  input: CreateJobForSubjectInput,
) {
  return request<Job>({
    url: `/jobs/${subjectId}`,
    method: "POST",
    data: input,
  });
}

export async function updateJob(id: string, input: UpdateJobInput) {
  return request<Job>({ url: `/jobs/${id}`, method: "PATCH", data: input });
}

export async function deleteJob(id: string) {
  return request<void>({ url: `/jobs/${id}`, method: "DELETE" });
}

/**
 * Record a payment.
 *
 * [4/12] The `Idempotency-Key` header is how the client's *intent* reaches the server: the same
 * key must accompany every delivery of the same intent, which is why the caller owns it (the
 * payment sheet mints one when it opens — [1/12]) instead of this function generating one per
 * call. Generating it here would mint a fresh key for every retry and deduplicate nothing.
 *
 * The header is required, not optional: a key only some clients send would protect only some
 * payments, so the endpoint answers 400 without it.
 */
export async function createPayment(
  jobId: string,
  input: CreatePaymentInput,
  idempotencyKey: string,
) {
  return request<Payment>({
    url: `/jobs/${jobId}/payments`,
    method: "POST",
    data: input,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}
