import type { PaginationMeta } from "@/types/api";
import type {
  CreateJobForSubjectInput,
  CreateJobInput,
  CreatePaymentInput,
  Job,
  JobsQuery,
  Payment,
  UpdateJobInput,
} from "@/types/job";
import { request } from "./transport";

export async function listJobs(params?: JobsQuery) {
  return request<Job[], PaginationMeta>({ url: "/jobs", params });
}

export async function listCustomerJobs(customerId: string, params?: JobsQuery) {
  return request<Job[], PaginationMeta>({
    url: `/customers/${customerId}/jobs`,
    params,
  });
}

export async function getJob(id: string) {
  return request<Job>({ url: `/jobs/${id}` });
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

export async function createPayment(jobId: string, input: CreatePaymentInput) {
  return request<Payment>({
    url: `/jobs/${jobId}/payments`,
    method: "POST",
    data: input,
  });
}
