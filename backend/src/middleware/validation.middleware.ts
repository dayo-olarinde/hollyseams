import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { ApiError } from "../utils/apiResponse";

export const validateInput =
  <T extends ZodTypeAny>(schema: T) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw new ApiError(
        400,
        "Validation failed",
        result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      );
    }
    req.body = result.data;
    next();
  };

export const validateParams =
  <T extends ZodTypeAny>(schema: T) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      throw new ApiError(
        400,
        "Invalid route parameters",
        result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      );
    }

    req.params = result.data as Record<string, string>;
    next();
  };

export const validateQuery =
  <T extends ZodTypeAny>(schema: T) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      throw new ApiError(
        400,
        "Invalid query parameters",
        result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      );
    }

    Object.defineProperty(req, "query", {
      value: result.data,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    next();
  };
