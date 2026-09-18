import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginRateLimitGuard } from "./login-rate-limit.guard";
import { PinHasherService } from "./pin-hasher.service";
import { SessionGuard } from "./session.guard";
import { SessionStore } from "./session.store";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionStore,
    PinHasherService,
    SessionGuard,
    LoginRateLimitGuard,
  ],
  exports: [SessionStore, SessionGuard],
})
export class AuthModule {}
