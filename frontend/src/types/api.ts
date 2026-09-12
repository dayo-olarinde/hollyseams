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

export interface PaginationMeta extends Record<string, unknown> {
  nextCursor: string | null;
  totalCount?: number;
  totalBalanceDue?: number;
}

export interface PaginatedQuery {
  limit?: number;
  cursor?: string;
}
