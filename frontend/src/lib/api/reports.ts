import type {
  MonthlyRevenue,
  OutstandingPayment,
  TopCustomer,
} from "@/types/report";
import { request } from "./transport";

export async function getMonthlyRevenue(signal?: AbortSignal) {
  return request<MonthlyRevenue[]>({
    url: "/reports/monthly-revenue",
    signal,
  });
}

export async function getTopCustomers(
  params?: { limit?: number },
  signal?: AbortSignal,
) {
  return request<TopCustomer[]>({
    url: "/reports/top-customers",
    params,
    signal,
  });
}

export async function getOutstandingPayments(signal?: AbortSignal) {
  return request<OutstandingPayment[]>({
    url: "/reports/outstanding-payments",
    signal,
  });
}
