import type {
  MonthlyRevenue,
  OutstandingPayment,
  TopCustomer,
} from "@/types/report";
import { request } from "./transport";

export async function getMonthlyRevenue() {
  return request<MonthlyRevenue[]>({ url: "/reports/monthly-revenue" });
}

export async function getTopCustomers(params?: { limit?: number }) {
  return request<TopCustomer[]>({ url: "/reports/top-customers", params });
}

export async function getOutstandingPayments() {
  return request<OutstandingPayment[]>({
    url: "/reports/outstanding-payments",
  });
}
