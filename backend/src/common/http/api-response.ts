export class ApiResponse<T = unknown> {
  public readonly success: boolean;

  constructor(
    public readonly statusCode = 200,
    public readonly message = "success",
    public readonly data?: T,
    public readonly meta?: Record<string, unknown>,
  ) {
    this.success = statusCode < 400;
  }
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  errors?: FieldError[];
  /** Stack traces are surfaced by the exception filter in development only. */
  stack?: string;
}

export class ApiError extends Error {
  public readonly success = false;

  /** An expected/handled failure rather than an unexpected crash. */
  public readonly isOperational = true;

  constructor(
    public readonly statusCode = 500,
    message = "Something went wrong",
    public readonly errors?: FieldError[],
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}
