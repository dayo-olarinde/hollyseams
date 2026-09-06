import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { ApiError } from "../utils/apiResponse";

export const notFound = (req: Request, _res: Response, next: NextFunction) => {
  next(new ApiError(404, `The resource ${req.originalUrl} was not found`));
};

export const globalError = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const error =
    err instanceof ApiError
      ? err
      : new ApiError(
          (err as { statusCode?: number })?.statusCode ?? 500,
          (err as { message?: string })?.message ?? "Something went wrong",
        );

  if (error.statusCode >= 500) {
    logger.error(
      {
        statusCode: error.statusCode,
        path: req.originalUrl,
        method: req.method,
        err,
      },
      "Unhandled error",
    );
  } else {
    logger.warn(
      `[${req.method} ${req.originalUrl}] ${error.statusCode} - ${error.message}`,
    );
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    ...(error.errors && { errors: error.errors }),
    ...(env.NODE_ENV === "development" && err instanceof Error && { stack: err.stack }),
  });
};
