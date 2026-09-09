/**
 * Typed boundary between the browser and the Express API.
 *
 * Every request includes cookies because the backend stores the authenticated
 * session in an httpOnly cookie. Keeping the Axios instance here means query
 * hooks and form mutations do not need to know about transport details.
 */
import axios, { AxiosError, type AxiosRequestConfig } from "axios";

const API_BASE = "/api/v1";

export interface FieldError {
  field: string;
  message: string;
}
export interface ApiResponse<T = unknown, M = Record<string, unknown>> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: M;
}
export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  errors?: FieldError[];
}
export interface LoginInput {
  pin: string;
}
export interface Customer {
  id: string;
  name: string;
  phoneNumber: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CreateCustomerInput {
  name: string;
  phoneNumber?: string;
}
export interface UpdateCustomerInput {
  name?: string;
  phoneNumber?: string;
}
export interface Subject {
  id: string;
  customerId: string;
  name: string;
  relationship: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CreateSubjectInput {
  name: string;
  relationship?: string;
}
export interface Measurement {
  id: string;
  subjectId: string;
  measurements: Record<string, number | null>;
  date: string;
  createdAt: string;
  updatedAt: string;
}
export interface CreateMeasurementInput {
  measurements: Record<string, number | null>;
  date: string;
}
export type JobStatus = "pending" | "completed" | "canceled";
export interface JobImage {
  url: string;
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
  styleRef: JobImage[];
  finishedJob: JobImage[];
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
    styleRef?: JobImage[];
    finishedJob?: JobImage[];
    description?: string;
    agreedPrice: number;
    status?: JobStatus;
    dueDate?: string | null;
  };
}
export interface CreateJobForSubjectInput {
  measurementId: string;
  job: {
    styleRef?: JobImage[];
    finishedJob?: JobImage[];
    description?: string;
    agreedPrice: number;
    status?: JobStatus;
    dueDate?: string | null;
  };
}
export interface UpdateJobInput {
  styleRef?: JobImage[];
  finishedJob?: JobImage[];
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
export interface MonthlyRevenue {
  monthKey: string;
  month: string;
  revenue: number;
  runningTotal: number;
}
export interface TopCustomer {
  customerId?: string;
  id?: string;
  customerName?: string;
  name?: string;
  totalPaid: number;
  jobCount: number;
}
export interface OutstandingPayment {
  jobId: string;
  customerName?: string;
  subjectName: string;
  status?: JobStatus;
  dueDate?: string | null;
  agreedPrice: number;
  totalPaid: number;
  balance?: number;
  balanceDue?: number;
  customer?: { id: string; name: string };
}
export interface PaginationMeta extends Record<string, unknown> {
  nextCursor: string | null;
  totalCount?: number;
  totalBalanceDue?: number;
}

export interface PaginatedQuery {
  limit?: number;
  cursor?: string;
}

/**
 * The statuses the jobs list endpoint can filter by. There is no literal
 * "delivered" row status — the backend maps it to completed + delivered_at
 * set (and "completed" to completed + delivered_at null, i.e. ready to
 * collect). Canceled jobs have no filter value and only appear under All.
 */
export type JobStatusFilter = "pending" | "completed" | "delivered";

export interface JobsQuery extends PaginatedQuery {
  status?: JobStatusFilter;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errors?: FieldError[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Axios normalizes network failures and API envelope failures into one error type for the UI. */
const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});
client.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse;
    if (body && body.success === false)
      throw new ApiError(
        body.statusCode,
        body.message,
        (body as ApiErrorResponse).errors,
      );
    return response;
  },
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response?.data)
      throw new ApiError(
        error.response.data.statusCode,
        error.response.data.message,
        error.response.data.errors,
      );
    throw new ApiError(0, "Connection failed. Check your network.");
  },
);

/** Return only the server envelope so consumers have a stable, typed contract. */
async function request<T, M = Record<string, unknown>>(config: AxiosRequestConfig): Promise<ApiResponse<T, M>> {
  const response = await client.request<ApiResponse<T, M>>(config);
  return response.data;
}/** The API has no separate session endpoint, so this authenticated read is the session check. */
export async function checkSession() { return listCustomers({ limit: 1 }); }
export async function login(input: LoginInput) { await request<void>({ url: "/auth/login", method: "POST", data: input }); }

export async function logout() {
  await request<void>({ url: "/auth/logout", method: "POST" });
}
export async function listCustomers(params?: PaginatedQuery) {
  return request<Customer[], PaginationMeta>({ url: "/customers", params });
}
export async function createCustomer(input: CreateCustomerInput) {
  return request<Customer>({ url: "/customers", method: "POST", data: input });
}
export async function getCustomer(id: string) {
  return request<Customer>({ url: `/customers/${id}` });
}
export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  return request<Customer>({
    url: `/customers/${id}`,
    method: "PATCH",
    data: input,
  });
}
export async function listSubjects(
  customerId: string,
  params?: PaginatedQuery,
) {
  return request<Subject[], PaginationMeta>({
    url: `/customers/${customerId}/subjects`,
    params,
  });
}
export async function addSubject(
  customerId: string,
  input: CreateSubjectInput,
) {
  return request<Subject>({
    url: `/customers/${customerId}/subjects`,
    method: "POST",
    data: input,
  });
}
export async function getSubject(id: string) {
  return request<Subject>({ url: `/subjects/${id}` });
}
export async function listMeasurements(
  subjectId: string,
  params?: PaginatedQuery,
) {
  return request<Measurement[], PaginationMeta>({
    url: `/subjects/${subjectId}/measurements`,
    params,
  });
}
export async function createMeasurement(
  subjectId: string,
  input: CreateMeasurementInput,
) {
  return request<Measurement>({
    url: `/subjects/${subjectId}/measurements`,
    method: "POST",
    data: input,
  });
}
export async function listJobs(params?: JobsQuery) {
  return request<Job[], PaginationMeta>({ url: "/jobs", params });
}
export async function getJob(id: string) {
  return request<Job>({ url: `/jobs/${id}` });
}
export async function createJob(input: CreateJobInput) {
  return request<Job>({
    url: "/jobs/new-customer",
    method: "POST",
    data: input,
  });
}
export async function createJobForSubject(subjectId: string, input: CreateJobForSubjectInput) {
  return request<Job>({ url: `/jobs/${subjectId}`, method: "POST", data: input });
}
export async function updateJob(id: string, input: UpdateJobInput) {
  return request<Job>({ url: `/jobs/${id}`, method: "PATCH", data: input });
}
export async function deleteJob(id: string) {
  return request<void>({ url: `/jobs/${id}`, method: "DELETE" });
}
export async function createPayment(jobId: string, input: CreatePaymentInput) {
  return request<Payment>({
    url: `/jobs/${jobId}/payments`,
    method: "POST",
    data: input,
  });
}
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
