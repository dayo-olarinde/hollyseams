import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  createPayment,
  getJob,
  listJobs,
  updateJob,
} from "@/lib/api/jobs";
import { reportKeys } from "./use-reports";
import type {
  JobStatusFilter,
  UpdateJobInput,
} from "@/types/job";

export type JobsListFilter = "all" | JobStatusFilter;

export const jobKeys = {
  all: ["jobs"] as const,
  list: (filter: JobsListFilter) => ["jobs", "list", filter] as const,
  counts: ["jobs", "counts"] as const,
  detail: (id: string) => ["job", id] as const,
};

function invalidateJobWrites(queryClient: QueryClient, jobId?: string) {
  if (jobId) {
    queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
  }
  queryClient.invalidateQueries({ queryKey: jobKeys.all });
  queryClient.invalidateQueries({
    queryKey: reportKeys.outstandingPayments,
  });
  queryClient.invalidateQueries({ queryKey: reportKeys.monthlyRevenue });
}

export function useInvalidateJobWrites() {
  const queryClient = useQueryClient();
  return (jobId?: string) => invalidateJobWrites(queryClient, jobId);
}

export function useJobsList(filter: JobsListFilter) {
  const status = filter === "all" ? undefined : filter;
  return useInfiniteQuery({
    queryKey: jobKeys.list(filter),
    queryFn: ({ pageParam }) =>
      listJobs({ limit: 10, cursor: pageParam, status }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.data ?? []),
  });
}

export function useJobsCounts() {
  return useQuery({
    queryKey: jobKeys.counts,
    queryFn: () => listJobs({ limit: 100 }),
    select: (response) => response.data ?? [],
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: jobKeys.detail(id),
    queryFn: () => getJob(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    select: (response) => response.data,
  });
}

export interface CreatePaymentVars {
  jobId: string;
  amount: number;
  paidAt?: string;
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, amount, paidAt }: CreatePaymentVars) =>
      createPayment(jobId, { amount, paidAt }),
    onSuccess: (_payment, variables) =>
      invalidateJobWrites(queryClient, variables.jobId),
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateJobInput }) =>
      updateJob(id, input),
    onSuccess: (_job, variables) =>
      invalidateJobWrites(queryClient, variables.id),
  });
}
