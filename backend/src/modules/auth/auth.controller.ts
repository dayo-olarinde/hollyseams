import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { ApiResponse } from "../../common/http/api-response";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { RateLimiterService } from "../../common/rate-limit/rate-limiter.service";
import { ENV, type Env } from "../../config/env.schema";
import { LOGIN_RATE_LIMIT, SESSION_COOKIE } from "./auth.constants";
import { AuthService } from "./auth.service";
import { LoginRateLimitGuard } from "./login-rate-limit.guard";
import { loginSchema, type LoginDto } from "./login.schema";
import {
  clearSessionCookieOptions,
  sessionCookieOptions,
} from "./session-cookie";
import { SessionGuard, type SessionRequest } from "./session.guard";
import { SessionStore } from "./session.store";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionStore,
    private readonly limiter: RateLimiterService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post("login")
  @HttpCode(200)
  @UseGuards(LoginRateLimitGuard)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiResponse> {
    const sessionId = await this.auth.login(body.pin);

    await this.limiter.reset(LOGIN_RATE_LIMIT.key);

    reply.setCookie(
      SESSION_COOKIE,
      sessionId,
      sessionCookieOptions(request, this.env),
    );

    return new ApiResponse(200, "Login successful");
  }

  @Get("session")
  @UseGuards(SessionGuard)
  session(): ApiResponse {
    return new ApiResponse(200, "Session active");
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async logout(
    @Req() request: SessionRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiResponse> {
    const sessionId = request.cookies?.[SESSION_COOKIE];

    if (sessionId) await this.sessions.revoke(sessionId);

    reply.clearCookie(
      SESSION_COOKIE,
      clearSessionCookieOptions(request, this.env),
    );

    return new ApiResponse(200, "Logout successful");
  }
}
