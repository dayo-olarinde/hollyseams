import { request } from "./transport";
import type { PaginationMeta, PaginatedQuery } from "@/types/api";
import type {
  CreateCustomerInput,
  Customer,
  UpdateCustomerInput,
} from "@/types/customer";

export async function listCustomers(params?: PaginatedQuery) {
  return request<Customer[], PaginationMeta>({ url: "/customers", params });
}

export async function createCustomer(input: CreateCustomerInput) {
  return request<Customer>({ url: "/customers", method: "POST", data: input });
}

export async function getCustomer(id: string) {
  return request<Customer>({ url: `/customers/${id}` });
}

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  return request<Customer>({
    url: `/customers/${id}`,
    method: "PATCH",
    data: input,
  });
}
