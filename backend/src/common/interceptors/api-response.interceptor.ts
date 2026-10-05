import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { map, type Observable } from "rxjs";

import { ApiResponse } from "../http/api-response";

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload: unknown) => {
        if (payload instanceof ApiResponse) {
          context
            .switchToHttp()
            .getResponse<FastifyReply>()
            .status(payload.statusCode);
        }

        return payload;
      }),
    );
  }
}
