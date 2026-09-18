import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getCustomer, listCustomers } from "@/lib/api/customers";
import { listCustomerJobs } from "@/lib/api/jobs";
import { listSubjects } from "@/lib/api/subjects";
import { keys } from "@/lib/query/keys";

const PAGE_SIZE = 20;

/**
 * Names, phones and how many clients there are — one request.
 *
 * The list endpoint returns `meta.totalCount` alongside the page, so the "12 clients · A→Z" line
 * comes from the response the list was already fetching. The old frontend asked for a *second*
 * copy of the list (`limit=100`, a hundred rows on a phone) purely to call `.length` on it, and it
 * was wrong past a hundred anyway.
 *
 * `select` therefore hands back both halves rather than just the rows: dropping the meta here is
 * what forced the second request in the first place.
 */
export function useCustomersList() {
  return useInfiniteQuery({
    queryKey: keys.customers.list,
    queryFn: ({ pageParam, signal }) =>
      listCustomers({ limit: PAGE_SIZE, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    // A client's name or phone number changes on the scale of months, not minutes. Five minutes of
    // freshness means the tab is instant; a write still invalidates it explicitly.
    staleTime: 5 * 60_000,
    select: (data) => {
      const rows = data.pages.flatMap((page) => page.data ?? []);
      return {
        rows,
        // Falls back to what has actually loaded when the server does not report a total, so the
        // header can never claim "0 clients" beside a list of them.
        totalCount: data.pages[0]?.meta?.totalCount ?? rows.length,
      };
    },
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: keys.customers.detail(id),
    queryFn: ({ signal }) => getCustomer(id, signal),
    enabled: !!id,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    select: (response) => response.data,
  });
}

/**
 * A client's subjects (the people their clothes get made for) — a file that is edited rarely, so
 * ten minutes of freshness and an hour in cache.
 */
export function useCustomerSubjects(id: string) {
  return useQuery({
    queryKey: keys.customers.subjects(id),
    queryFn: ({ signal }) => listSubjects(id, { limit: 100 }, signal),
    enabled: !!id,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    select: (response) => response.data ?? [],
  });
}

export function useCustomerJobs(id: string) {
  return useQuery({
    queryKey: keys.customers.jobs(id),
    queryFn: ({ signal }) => listCustomerJobs(id, { limit: 100 }, signal),
    enabled: !!id,
    staleTime: 2 * 60_000,
    select: (response) => response.data ?? [],
  });
}

/**
 * Warm a client's whole file while the finger is still down.
 *
 * The customer file is three requests — the client, their subjects, and their jobs — and it has no
 * shell covering it, so every cold tap otherwise means a skeleton. Two of the three depend only on
 * the id, so they go out together on `touchstart` and the page is usually already whole by the
 * time it mounts. `prefetchQuery` skips anything still fresh, so this is idempotent.
 */
export function usePrefetchCustomerFile() {
  const queryClient = useQueryClient();

  return (id: string) => {
    void queryClient.prefetchQuery({
      queryKey: keys.customers.detail(id),
      queryFn: ({ signal }) => getCustomer(id, signal),
      staleTime: 5 * 60_000,
    });
    void queryClient.prefetchQuery({
      queryKey: keys.customers.subjects(id),
      queryFn: ({ signal }) => listSubjects(id, { limit: 100 }, signal),
      staleTime: 10 * 60_000,
    });
    void queryClient.prefetchQuery({
      queryKey: keys.customers.jobs(id),
      queryFn: ({ signal }) => listCustomerJobs(id, { limit: 100 }, signal),
      staleTime: 2 * 60_000,
    });
  };
}
