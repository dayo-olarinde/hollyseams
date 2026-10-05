import { request } from "./transport";
import type { PaginationMeta, PaginatedQuery } from "@/types/api";
import type { Customer, UpdateCustomerInput } from "@/types/customer";

/**
 * `meta.totalCount` is the exact size of the whole table, counts included.
 *
 * The tab needs one number ("12 clients · A→Z") that a cursor page cannot contain, and the
 * previous frontend fetched a second, full copy of the list just to call `.length` on it. Asking
 * the database for a count is one aggregate instead of a hundred rows over the phone.
 */
export async function listCustomers(
  params?: PaginatedQuery,
  signal?: AbortSignal,
) {
  return request<Customer[], PaginationMeta>({
    url: "/customers",
    params,
    signal,
  });
}

export async function getCustomer(id: string, signal?: AbortSignal) {
  return request<Customer>({ url: `/customers/${id}`, signal });
}

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  return request<Customer>({
    url: `/customers/${id}`,
    method: "PATCH",
    data: input,
  });
}
