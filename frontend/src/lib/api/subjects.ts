import { request } from "./transport";
import type { PaginationMeta, PaginatedQuery } from "@/types/api";
import type { CreateSubjectInput, Subject } from "@/types/subject";

export async function listSubjects(
  customerId: string,
  params?: PaginatedQuery,
  signal?: AbortSignal,
) {
  return request<Subject[], PaginationMeta>({
    url: `/customers/${customerId}/subjects`,
    params,
    signal,
  });
}

export async function addSubject(
  customerId: string,
  input: CreateSubjectInput,
) {
  return request<Subject>({
    url: `/customers/${customerId}/subjects`,
    method: "POST",
    data: input,
  });
}
