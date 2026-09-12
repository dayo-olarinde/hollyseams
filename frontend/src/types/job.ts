import type { PaginatedQuery } from "./api";

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
  measurements?: Record<string, number | null>;
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
    measurements: Record<string, number | null>;
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

export interface JobsQuery extends PaginatedQuery {
  status?: JobStatusFilter;
}
