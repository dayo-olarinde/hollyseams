import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { ENV, type Env } from "../../config/env.schema";
import { mapPostgresError } from "../../database/db-error";
import {
  ApiError,
  type ApiErrorResponse,
  type FieldError,
} from "../http/api-response";

interface NormalizedError {
  statusCode: number;
  message: string;
  errors?: FieldError[];
  dbCode?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(ENV) private readonly env: Env) {}
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();

    const { statusCode, message, errors, dbCode } = this.normalize(
      exception,
      request,
    );

    if (statusCode >= 500) {
      this.logger.error("Unhandled error", {
        statusCode,
        path: request.url,
        method: request.method,
        err: exception,
      });
    } else {
      this.logger.warn(
        `[${request.method} ${request.url}] ${statusCode} - ${message}${
          dbCode ? ` (postgres ${dbCode})` : ""
        }`,
      );
    }

    const body: ApiErrorResponse = {
      success: false,
      statusCode,
      message,

      ...(errors && { errors }),
      ...(this.env.NODE_ENV === "development" &&
        exception instanceof Error && { stack: exception.stack }),
    };

    reply.status(statusCode).send(body);
  }

  private normalize(
    exception: unknown,
    request: FastifyRequest,
  ): NormalizedError {
    if (exception instanceof ApiError) {
      return {
        statusCode: exception.statusCode,
        message: exception.message,
        errors: exception.errors,
      };
    }

    const dbError = mapPostgresError(exception);
    if (dbError) {
      return {
        statusCode: dbError.statusCode,
        message: dbError.message,
        dbCode: dbError.code,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();

      if (statusCode === HttpStatus.NOT_FOUND) {
        return {
          statusCode,
          message: `The resource ${request.url} was not found`,
        };
      }

      return { statusCode, message: this.httpExceptionMessage(exception) };
    }

    // Some third-party/Fastify errors expose statusCode/message, so inspect those fields if available.
    const candidate = exception as {
      statusCode?: number;
      message?: string;
    } | null;

    const statusCode =
      typeof candidate?.statusCode === "number" ? candidate.statusCode : 500;

    return {
      statusCode,

      message:
        statusCode >= 500
          ? "Something went wrong"
          : (candidate?.message ?? "Something went wrong"),
    };
  }

  private httpExceptionMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === "string") return response;

    const message = (response as { message?: unknown }).message;

    if (Array.isArray(message)) return message.map(String).join(", ");
    if (typeof message === "string") return message;

    return exception.message;
  }
}
