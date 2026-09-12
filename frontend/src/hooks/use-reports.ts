import { useQuery } from "@tanstack/react-query";
import {
  getMonthlyRevenue,
  getOutstandingPayments,
  getTopCustomers,
} from "@/lib/api/reports";

export const reportKeys = {
  all: ["reports"] as const,
  monthlyRevenue: ["reports", "monthly-revenue"] as const,
  outstandingPayments: ["reports", "outstanding-payments"] as const,
  topCustomers: (limit: number) => ["reports", "top-customers", limit] as const,
};

export function useMonthlyRevenue() {
  return useQuery({
    queryKey: reportKeys.monthlyRevenue,
    queryFn: getMonthlyRevenue,
    select: (response) => response.data ?? [],
  });
}

export function useOutstandingPayments() {
  return useQuery({
    queryKey: reportKeys.outstandingPayments,
    queryFn: getOutstandingPayments,
    select: (response) => response.data ?? [],
  });
}

export function useTopCustomers(limit = 5) {
  return useQuery({
    queryKey: reportKeys.topCustomers(limit),
    queryFn: () => getTopCustomers({ limit }),
    select: (response) => response.data ?? [],
  });
}
