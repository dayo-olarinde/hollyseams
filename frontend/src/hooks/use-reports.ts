import { useQuery } from "@tanstack/react-query";
import {
  getMonthlyRevenue,
  getOutstandingPayments,
  getTopCustomers,
} from "@/lib/api/reports";
import { keys } from "@/lib/query/keys";

/**
 * The three statements.
 *
 * These are the queries where `staleTime` is a *decision* rather than a default. Everything else in
 * the app is a record the tailor edits; these are aggregates over every job and payment, computed
 * by three SQL statements on the server. They are also the numbers a tailor checks against real
 * money, so being forty minutes out of date is not acceptable while being one minute out of date
 * almost always is.
 *
 * Sixty seconds buys: instant tab switches, no repeat computation for a user who taps back and
 * forth between the dashboard and Reports, and a background refresh that is invisible because the
 * last known numbers stay on screen while it runs. Any write invalidates all three immediately,
 * so the freshness that matters — after recording a payment — is exact.
 */
const REPORT_STALE_TIME_MS = 60_000;

/**
 * The options live outside the hooks so an idle prefetch can warm the *exact* key the tab will
 * read — same key, same function, same staleness. Two copies of that triple is how a prefetch
 * ends up warming a key nothing reads.
 */
export const outstandingPaymentsOptions = () => ({
  queryKey: keys.reports.outstandingPayments,
  queryFn: ({ signal }: { signal: AbortSignal }) => getOutstandingPayments(signal),
  staleTime: REPORT_STALE_TIME_MS,
});

export const topCustomersOptions = (limit: number) => ({
  queryKey: keys.reports.topCustomers(limit),
  queryFn: ({ signal }: { signal: AbortSignal }) => getTopCustomers({ limit }, signal),
  staleTime: REPORT_STALE_TIME_MS,
});

export function useMonthlyRevenue() {
  return useQuery({
    queryKey: keys.reports.monthlyRevenue,
    queryFn: ({ signal }) => getMonthlyRevenue(signal),
    staleTime: REPORT_STALE_TIME_MS,
    select: (response) => response.data ?? [],
  });
}

export function useOutstandingPayments() {
  return useQuery({
    ...outstandingPaymentsOptions(),
    select: (response) => response.data ?? [],
  });
}

export function useTopCustomers(limit = 5) {
  return useQuery({
    ...topCustomersOptions(limit),
    select: (response) => response.data ?? [],
  });
}
