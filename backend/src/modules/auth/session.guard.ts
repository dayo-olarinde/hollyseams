import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { ApiError } from "../../common/http/api-response";
import { SESSION_COOKIE } from "./auth.constants";
import type { SessionDto } from "./session.schema";
import { SessionStore } from "./session.store";

export interface SessionRequest extends FastifyRequest {
  session?: SessionDto;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();

    const sessionId = request.cookies?.[SESSION_COOKIE];
    if (!sessionId) throw new ApiError(401, "Not authenticated");

    request.session = await this.sessions.read(sessionId);

    return true;
  }
}
