export class ApiResponse<T = unknown> {
  // Whether this response represents success; calculated automatically from the HTTP status.
  public readonly success: boolean;

  constructor(
    // HTTP status to send, e.g. 200, 201, or 204.
    public readonly statusCode = 200,

    // Human-readable message returned to the client.
    public readonly message = "success",

    // Optional response data; T determines its TypeScript shape.
    // Example: ApiResponse<Customer> → data is a Customer.
    public readonly data?: T,

    // Optional metadata such as pagination information.
    // Example: { nextCursor: "abc123" }.
    public readonly meta?: Record<string, unknown>,
  ) {
    // 2xx/3xx are treated as successful; 4xx/5xx are treated as failures.
    this.success = statusCode < 400;
  }
}

export interface FieldError {
  // Identifies which input field caused the validation error.
  // Example: "email".
  field: string;

  // Explains what is wrong with that field.
  // Example: "Invalid email address".
  message: string;
}

export interface ApiErrorResponse {
  // Always false because this shape is only used for failed requests.
  success: false;

  // HTTP status sent to the client.
  // Example: 400, 401, 404, or 500.
  statusCode: number;

  // General description of the error.
  // Example: "Invalid PIN".
  message: string;

  // Optional field-level errors, useful for validation failures.
  // Example: [{ field: "email", message: "Invalid email" }].
  errors?: FieldError[];

  // Optional stack trace; your exception filter only exposes this in development.
  stack?: string;
}

export class ApiError extends Error {
  // Marks this as a failed application error.
  public readonly success = false;

  // Indicates this is an expected/handled application error rather than an unexpected crash.
  public readonly isOperational = true;

  constructor(
    // HTTP status that the exception filter should eventually send.
    public readonly statusCode = 500,

    // Human-readable error message.
    message = "Something went wrong",

    // Optional field-level errors to include in the API response.
    public readonly errors?: FieldError[],
  ) {
    // Call Error's constructor so this object behaves like a normal JavaScript Error.
    super(message);

    // Capture a useful stack trace starting from where ApiError was created.
    Error.captureStackTrace(this, this.constructor);
  }
}
