import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getCustomer, listCustomers } from "@/lib/api/customers";
import { listCustomerJobs } from "@/lib/api/jobs";
import { listSubjects } from "@/lib/api/subjects";

export const customerKeys = {
  all: ["customers"] as const,
  list: ["customers", "list"] as const,
  counts: ["customers", "counts"] as const,
  detail: (id: string) => ["customer", id] as const,
  subjects: (id: string) => ["customer", id, "subjects"] as const,
  jobs: (id: string) => ["customer", id, "jobs"] as const,
};

export function useCustomersList() {
  return useInfiniteQuery({
    queryKey: customerKeys.list,
    queryFn: ({ pageParam }) => listCustomers({ limit: 20, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.data ?? []),
  });
}

export function useCustomersCounts() {
  return useQuery({
    queryKey: customerKeys.counts,
    queryFn: () => listCustomers({ limit: 100 }),
    select: (response) => response.data ?? [],
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => getCustomer(id),
    enabled: !!id,
    select: (response) => response.data,
  });
}

export function useCustomerSubjects(id: string) {
  return useQuery({
    queryKey: customerKeys.subjects(id),
    queryFn: () => listSubjects(id, { limit: 100 }),
    enabled: !!id,
    select: (response) => response.data ?? [],
  });
}

export function useCustomerJobs(id: string) {
  return useQuery({
    queryKey: customerKeys.jobs(id),
    queryFn: () => listCustomerJobs(id, { limit: 100 }),
    enabled: !!id,
    select: (response) => response.data ?? [],
  });
}
