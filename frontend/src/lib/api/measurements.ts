import { request } from "./transport";
import type { PaginationMeta, PaginatedQuery } from "@/types/api";
import type { CreateMeasurementInput, Measurement } from "@/types/measurement";

export async function listMeasurements(
  subjectId: string,
  params?: PaginatedQuery,
) {
  return request<Measurement[], PaginationMeta>({
    url: `/subjects/${subjectId}/measurements`,
    params,
  });
}

export async function createMeasurement(
  subjectId: string,
  input: CreateMeasurementInput,
) {
  return request<Measurement>({
    url: `/subjects/${subjectId}/measurements`,
    method: "POST",
    data: input,
  });
}
