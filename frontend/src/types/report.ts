import type { JobStatus } from "./job";

export interface MonthlyRevenue {
  monthKey: string;
  month: string;
  revenue: number;
  runningTotal: number;
}

export interface TopCustomer {
  id: string;
  name: string;
  totalPaid: number;
  jobCount: number;
}

export interface OutstandingPayment {
  jobId: string;
  customer: { id: string; name: string };
  subjectName: string;
  description: string;
  status: JobStatus;
  dueDate: string | null;
  agreedPrice: number;
  totalPaid: number;
  balanceDue: number;
}
