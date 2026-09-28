import type { PaginatedQuery } from "./api";
import type { MeasurementValue } from "@/lib/measurement-input";

export type JobStatus = "pending" | "completed" | "canceled";

export interface JobImage {
  url: string;
  publicId?: string;
  alt: string;
}

export interface JobImageInput {
  publicId: string;
  alt: string;
}

export interface Payment {
  id: string;
  jobId: string;
  amount: number;
  paidAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  customerId: string;
  subjectId: string;
  measurementId: string;
  subjectName?: string;
  customerPhone?: string | null;
  measurements?: Record<string, MeasurementValue | null>;
  styleRef?: JobImage[];
  finishedJob?: JobImage[];
  coverUrl?: string | null;
  photoCount?: number;
  description: string;
  agreedPrice: number;
  status: JobStatus;
  dueDate: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  payments?: Payment[];
}

export interface CreateJobInput {
  customer: { name: string; phoneNumber?: string };
  subjects: Array<{
    relationship?: string;
    name?: string;
    measurements: Record<string, MeasurementValue | null>;
  }>;
  job: {
    styleRef?: JobImageInput[];
    finishedJob?: JobImageInput[];
    description?: string;
    agreedPrice: number;
    status?: JobStatus;
    dueDate?: string | null;
  };
}

export interface CreateJobForSubjectInput {
  measurementId: string;
  job: {
    styleRef?: JobImageInput[];
    finishedJob?: JobImageInput[];
    description?: string;
    agreedPrice: number;
    status?: JobStatus;
    dueDate?: string | null;
  };
}

export interface UpdateJobInput {
  styleRef?: JobImageInput[];
  finishedJob?: JobImageInput[];
  description?: string;
  agreedPrice?: number;
  status?: JobStatus;
  dueDate?: string | null;
  deliveredAt?: string | null;
}

export interface CreatePaymentInput {
  amount: number;
  paidAt?: string;
}

export type JobStatusFilter = "pending" | "completed" | "delivered";

/**
 * The status tab counts, as `GET /jobs/counts` returns them.
 *
 * `all` includes cancelled jobs, which have no tab of their own; `ready` is the API's
 * `status=completed` filter (completed and not yet delivered), so a tab label always agrees with
 * the list it opens.
 */
export interface JobCounts {
  all: number;
  pending: number;
  ready: number;
  delivered: number;
  /** Still open and past its due date, counted by the server rather than inferred from a page. */
  overdue: number;
}

export interface JobsQuery extends PaginatedQuery {
  status?: JobStatusFilter;
}
