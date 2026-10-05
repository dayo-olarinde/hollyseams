import { Inject, Injectable } from "@nestjs/common";

import { ApiError } from "../../common/http/api-response";
import { userTable } from "../../database";
import { DRIZZLE, type Database } from "../../database/database.module";
import { LoginAttemptsService } from "./login-attempts.service";
import { PinHasherService } from "./pin-hasher.service";
import { SessionStore } from "./session.store";

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly hasher: PinHasherService,
    private readonly sessions: SessionStore,
    private readonly attempts: LoginAttemptsService,
  ) {}

  /**
   * Step 5 of the login flow mapped in auth.controller.ts.
   *
   * 5. Verify the PIN —
   *    a. single query, no WHERE: this is a single-user app, the one row IS the account
   *       (deliberate; add an identifier filter if it ever becomes multi-tenant);
   *    b. argon2 verify against the peppered hash;
   *    c. wrong PIN → record the failure; from the 4th consecutive one the lockout in
   *       LoginAttemptsService freezes login for 30s, 60s, 120s … up to 1h;
   *    d. right PIN → the failure streak and lock are erased;
   *    e. return the session id — the controller wipes the fixed-window counter next.
   */
  async login(pin: string): Promise<string> {
    const [user] = await this.db
      .select({ id: userTable.id, pinHash: userTable.pinHash })
      .from(userTable);

    if (!user) {
      await this.attempts.recordFailure();
      throw new ApiError(401, "Incorrect PIN. Try again.");
    }

    const validPin = await this.hasher.verifyPin(pin, user.pinHash);
    if (!validPin) {
      await this.attempts.recordFailure();
      throw new ApiError(401, "Incorrect PIN. Try again.");
    }

    await this.attempts.reset();

    return await this.sessions.issue(user.id);
  }
}
