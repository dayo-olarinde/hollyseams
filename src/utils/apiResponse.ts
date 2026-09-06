export class ApiResponse<T = unknown> {
  public readonly success: boolean;

  constructor(
    public readonly statusCode = 200,
    public readonly message = "success",
    public readonly data?: T,
  ) {
    this.success = statusCode < 400;
  }
}

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  public readonly success = false;
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
