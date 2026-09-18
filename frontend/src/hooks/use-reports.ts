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
    queryKey: keys.reports.outstandingPayments,
    queryFn: ({ signal }) => getOutstandingPayments(signal),
    staleTime: REPORT_STALE_TIME_MS,
    select: (response) => response.data ?? [],
  });
}

export function useTopCustomers(limit = 5) {
  return useQuery({
    queryKey: keys.reports.topCustomers(limit),
    queryFn: ({ signal }) => getTopCustomers({ limit }, signal),
    staleTime: REPORT_STALE_TIME_MS,
    select: (response) => response.data ?? [],
  });
}
