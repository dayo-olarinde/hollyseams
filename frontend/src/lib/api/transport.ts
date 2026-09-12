import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import type { ApiErrorResponse, ApiResponse, FieldError } from "@/types/api";

const API_BASE = "/api/v1";

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

export async function request<T, M = Record<string, unknown>>(
  config: AxiosRequestConfig,
): Promise<ApiResponse<T, M>> {
  const response = await client.request<ApiResponse<T, M>>(config);
  return response.data;
}
