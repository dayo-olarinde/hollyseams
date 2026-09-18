import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { map, type Observable } from "rxjs";

import { ApiResponse } from "../http/api-response";

@Injectable() // Tell Nest to manage this interceptor through dependency injection.
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext, // Gives access to the current request/response execution context.
    next: CallHandler, // Represents the next step in the request pipeline — ultimately the controller.
  ): Observable<unknown> {
    return next.handle().pipe(
      // Run this code when the controller's returned value comes back through the pipeline.
      map((payload: unknown) => {
        // Only modify responses that use our custom ApiResponse class.
        if (payload instanceof ApiResponse) {
          // Get Fastify's response object so we can set the actual HTTP status code.
          context
            .switchToHttp()
            .getResponse<FastifyReply>()
            .status(payload.statusCode);

          // Example: ApiResponse(201, "Customer created") → HTTP status becomes 201.
        }

        // Return the payload so Nest can continue sending it to the client.
        return payload;
      }),
    );
  }
}
