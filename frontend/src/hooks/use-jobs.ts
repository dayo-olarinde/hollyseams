import { useEffect } from "react";
import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  createPayment,
  getJob,
  getJobCounts,
  listJobs,
  updateJob,
} from "@/lib/api/jobs";
import { keys } from "@/lib/query/keys";
import { scheduleIdle } from "@/lib/schedule-idle";
import type {
  Job,
  JobCounts,
  JobStatusFilter,
  UpdateJobInput,
} from "@/types/job";

export type JobsListFilter = "all" | JobStatusFilter;

/** The status tabs on the jobs screen, in display order. */
export const JOB_FILTERS: JobsListFilter[] = [
  "all",
  "pending",
  "completed",
  "delivered",
];

const PAGE_SIZE = 10;

/**
 * One definition of "a page of jobs for a status tab".
 *
 * Shared by the hook and the idle prefetch below, which is the point: two copies of a query key or
 * a page size is how a prefetch ends up warming a key nothing reads, and the "instant" tab still
 * shows a skeleton.
 */
export const jobListOptions = (filter: JobsListFilter) =>
  infiniteQueryOptions({
    queryKey: keys.jobs.list(filter),
    queryFn: ({ pageParam, signal }) =>
      listJobs(
        {
          limit: PAGE_SIZE,
          cursor: pageParam,
          status: filter === "all" ? undefined : filter,
        },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });

export function useJobsList(filter: JobsListFilter) {
  return useInfiniteQuery({
    ...jobListOptions(filter),
    select: (data) => data.pages.flatMap((page) => page.data ?? []),
  });
}

/**
 * Warm the status tabs the tailor is *not* reading, once the phone is otherwise idle.
 *
 * The filter row swaps the query key, so an unwarmed key means a fresh skeleton for data the
 * screen could already have. Three small requests are a cheap price for instant taps — but only
 * when they do not compete with the request that is actually on screen, which is why this waits
 * for `requestIdleCallback` instead of firing in a mount effect. On a phone over a slow network
 * the old version's three eager requests ran *alongside* the visible one and made the screen the
 * tailor was looking at slower to fill.
 */
export function usePrefetchJobFilters() {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      scheduleIdle(() => {
        for (const filter of JOB_FILTERS) {
          // Skipped by React Query when the tab is still fresh, so this is only ever a real
          // request for data that is genuinely missing.
          void queryClient.prefetchInfiniteQuery(jobListOptions(filter));
        }
      }),
    [queryClient],
  );
}

/**
 * The tab counts, from the aggregate endpoint.
 *
 * `placeholderData` keeps the last known numbers on screen while a refetch is in flight, so a
 * stale count fades into a fresh one instead of collapsing to "…" and back.
 */
export function useJobCounts() {
  return useQuery({
    queryKey: keys.jobs.counts,
    queryFn: ({ signal }) => getJobCounts(signal),
    select: (response): JobCounts =>
      response.data ?? { all: 0, pending: 0, ready: 0, delivered: 0, overdue: 0 },
    placeholderData: (previous) => previous,
  });
}

/**
 * One job, cached like a record rather than like a screen.
 *
 * Five minutes of `staleTime` because a job barely changes — and when it does, it changes *here*,
 * through a mutation that invalidates this exact key. Paying a refetch on every visit to data the
 * app itself just wrote would be the cache doing nothing. An hour of `gcTime` keeps a job the
 * tailor opened a moment ago warm while they step back to the list and return.
 */
export function useJob(id: string) {
  return useQuery({
    queryKey: keys.jobs.detail(id),
    queryFn: ({ signal }) => getJob(id, signal),
    enabled: !!id,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    select: (response) => response.data,
  });
}

/**
 * Fetch a job before the finger lifts.
 *
 * A tap is not instantaneous: `touchstart` → `pointerup` is 80–250ms of intent on a phone, and the
 * detail route has to arrive from the server in that window. Starting the request on touch means
 * the page the user lands on usually has its data already, and the detail skeleton — which has no
 * shell covering it, unlike a tab — never appears at all on a warm connection.
 *
 * `prefetchQuery` respects `staleTime`, so touching the same card repeatedly fetches once.
 */
export function usePrefetchJob() {
  const queryClient = useQueryClient();

  return (id: string) =>
    void queryClient.prefetchQuery({
      queryKey: keys.jobs.detail(id),
      queryFn: ({ signal }) => getJob(id, signal),
      staleTime: 5 * 60_000,
    });
}

/**
 * Everything a job write can make wrong, invalidated in one call.
 *
 * A job touches more than the jobs list: its balance is in three reports, its status moves the tab
 * counts, and creating one for a new client changes the customers list too. The old code
 * remembered the jobs and the reports and forgot the customers — so a job created a minute ago was
 * missing from the Clients tab until the cache went stale, which reads as data loss.
 *
 * Every write funnels through here, which is the only way to guarantee that.
 */
export function invalidateJobWrites(queryClient: QueryClient, jobId?: string) {
  if (jobId) {
    void queryClient.invalidateQueries({ queryKey: keys.jobs.detail(jobId) });
  }
  void queryClient.invalidateQueries({ queryKey: keys.jobs.all });
  void queryClient.invalidateQueries({ queryKey: keys.reports.all });
  void queryClient.invalidateQueries({ queryKey: keys.customers.all });
}

export function useInvalidateJobWrites() {
  const queryClient = useQueryClient();
  return (jobId?: string) => invalidateJobWrites(queryClient, jobId);
}

export interface CreatePaymentVars {
  jobId: string;
  amount: number;
  paidAt?: string;
  /**
   * [3/12] The intent's idempotency key, carried from the payment sheet's state into the API
   * client and out as the `Idempotency-Key` header ([4/12]). One key per intent: re-running the
   * same mutation — React Query retry, the user tapping again after a timeout — must pass the
   * same value, or the backend would see two intents.
   */
  idempotencyKey: string;
}

/**
 * Record a payment, and show it immediately.
 *
 * On a phone, the round trip is the whole wait: the tailor has already counted the cash, and the
 * balance they are watching must not lag behind the tap. So the cached job is patched first — the
 * new payment appended, the balance recomputed from it — the sheet closes, and the server's answer
 * arrives to confirm or to undo it.
 *
 * If the write fails the patch is rolled back from the snapshot taken in `onMutate`, so the screen
 * never keeps a balance that does not exist. This is the narrow, honest use of an optimistic
 * update: one field of one record, with a rollback that always runs.
 *
 * A retry cannot turn one payment into two, and that guarantee is the server's, not this hook's:
 * the mutation carries the sheet's key ([1/12]–[4/12]) and the endpoint records one payment per
 * key ([5/12]–[11/12]). Re-running a failed attempt is therefore always safe.
 */
export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, amount, paidAt, idempotencyKey }: CreatePaymentVars) =>
      createPayment(jobId, { amount, paidAt }, idempotencyKey),

    onMutate: async ({ jobId, amount, paidAt }) => {
      // Stop an in-flight refetch from landing on top of the patch.
      await queryClient.cancelQueries({ queryKey: keys.jobs.detail(jobId) });

      const previous = queryClient.getQueryData<Job>(keys.jobs.detail(jobId));

      if (previous) {
        const now = new Date().toISOString();
        const paidAtValue = paidAt ?? now;

        queryClient.setQueryData<Job>(keys.jobs.detail(jobId), {
          ...previous,
          payments: [
            ...(previous.payments ?? []),
            // A temporary id: the payment list is keyed by index in the UI, and the invalidation
            // that follows replaces this row with the server's.
            {
              id: `optimistic-${paidAtValue}`,
              jobId,
              amount,
              paidAt: paidAtValue,
              createdAt: now,
              updatedAt: now,
            },
          ],
        });
      }

      return { previous };
    },

    onError: (_error, variables, context) => {
      // Missing previous data means there was nothing to patch, so there is nothing to undo.
      if (context?.previous) {
        queryClient.setQueryData(
          keys.jobs.detail(variables.jobId),
          context.previous,
        );
      }
    },

    // [12/12] Runs on success *and* failure: the cache is reconciled with the server either way,
    // so an optimistic row a failed attempt left behind is replaced by the real one — and a
    // replay resolves to the payment the first delivery had already written.
    onSettled: (_data, _error, variables) =>
      invalidateJobWrites(queryClient, variables.jobId),
  });
}

/**
 * Change a job's status, with the badge moving under the finger.
 *
 * The status buttons are the most repeated action in the app — every job ends with "ready" then
 * "delivered" — so the one thing the user watches (the status badge, the tab counts, the case's
 * place in the list) updates from the cache first and is confirmed by the response.
 */
export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateJobInput }) =>
      updateJob(id, input),

    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: keys.jobs.detail(id) });

      const previous = queryClient.getQueryData<Job>(keys.jobs.detail(id));

      if (previous) {
        queryClient.setQueryData<Job>(keys.jobs.detail(id), {
          ...previous,
          ...optimisticPatch(input),
        });
      }

      return { previous };
    },

    onError: (_error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.jobs.detail(variables.id), context.previous);
      }
    },

    onSettled: (_data, _error, variables) =>
      invalidateJobWrites(queryClient, variables.id),
  });
}

/** `Date | null | undefined` → the string shape the rest of the app formats. */
const toIsoDate = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : value;

/**
 * The fields that are safe to show before the server confirms.
 *
 * Photos are deliberately absent. `styleRef`/`finishedJob` are sent as `{ publicId, alt }` and come
 * back as resolved `{ url, publicId, alt }` — the backend verifies each id with Cloudinary and
 * signs the URL, so a client-side guess would render a broken image where the real one is about to
 * arrive. Status, text and dates are plain values; those are worth showing immediately.
 */
function optimisticPatch(input: UpdateJobInput): Partial<Job> {
  const patch: Partial<Job> = {};

  if (input.status !== undefined) patch.status = input.status;
  if (input.description !== undefined) patch.description = input.description;
  if (input.agreedPrice !== undefined) patch.agreedPrice = input.agreedPrice;
  if (input.dueDate !== undefined) patch.dueDate = toIsoDate(input.dueDate);
  if (input.deliveredAt !== undefined)
    patch.deliveredAt = toIsoDate(input.deliveredAt);

  return patch;
}
