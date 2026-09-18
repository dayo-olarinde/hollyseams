import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import type { ApiErrorResponse, ApiResponse, FieldError } from "@/types/api";

const API_BASE = "/api/v1";

/**
 * How long a request may hang before the UI is told it failed.
 *
 * axios has no default timeout, so a request to a phone on a flaky network — or a backend that
 * accepted the connection and then stalled — stays pending forever. React Query would keep the
 * query in `isPending`, the skeleton would never resolve, and the only honest label for that
 * screen is "hung". Fifteen seconds is long enough for a slow mobile upload of JSON, short
 * enough that a user gets a retry instead of a spinner they will give up on first.
 */
const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errors?: FieldError[],
  ) {
    super(message);
    this.name = "ApiError";
  }

  /**
   * `statusCode === 0` is not an HTTP status — it is this class's stand-in for "the request
   * never reached the server". Keeping it a number means callers can switch on a single field.
   */
  get isNetworkError(): boolean {
    return this.statusCode === 0;
  }
}

const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: REQUEST_TIMEOUT_MS,
});

/**
 * The HTTP status is the status — not the copy in the body.
 *
 * This is worth spelling out, because the original transport read `body.statusCode` and the two
 * servers in this repo do not agree on sending it. The Nest one does; the Express one's error
 * middleware sends only `{ success, message, errors?, stack? }`. So against the backend that is
 * actually running today, every `ApiError` had `statusCode: undefined` — which is why the old UI
 * could not tell 401 from 500 from "no connection", and printed "Check your connection" for all
 * of them. An HTTP status is always present, it is the protocol's own answer, and it cannot
 * contradict itself the way a duplicated field can.
 */
const toApiError = (error: AxiosError<ApiErrorResponse>): ApiError => {
  const status = error.response?.status;
  const body = error.response?.data;

  if (status) {
    return new ApiError(
      status,
      body?.message ?? "Something went wrong",
      body?.errors,
    );
  }

  // No response at all: a timeout signals the same thing to the user as a dead network — nothing
  // was saved, try again — so both map to status 0.
  return new ApiError(0, "Connection failed. Check your network.");
};

client.interceptors.response.use(
  (response) => {
    // The API answers 2xx with `{ success: false }` only if it were broken, but treating it as
    // success would hand `undefined` data to the UI and turn a backend bug into a render crash.
    const body = response.data as ApiResponse | undefined;
    if (body && body.success === false) {
      throw new ApiError(
        body.statusCode,
        body.message,
        (body as ApiErrorResponse).errors,
      );
    }
    return response;
  },
  (error: AxiosError<ApiErrorResponse>) => {
    // Cancellation is not a failure. React Query aborts a query when its key changes or its
    // observer unmounts — which is exactly what a fast tap through the filter row does. Rethrow
    // the original error so React Query can recognise the abort and drop the result instead of
    // showing "Connection failed" for a request the user themselves replaced.
    if (axios.isCancel(error)) throw error;

    throw toApiError(error);
  },
);

/**
 * One place that knows how the API is called.
 *
 * `signal` is threaded through by every caller that can be cancelled (React Query hands one to
 * each `queryFn`), so an abandoned request stops competing for the phone's bandwidth instead of
 * finishing into a cache nobody reads.
 */
export async function request<T, M = Record<string, unknown>>(
  config: AxiosRequestConfig,
): Promise<ApiResponse<T, M>> {
  const response = await client.request<ApiResponse<T, M>>(config);
  return response.data;
}
