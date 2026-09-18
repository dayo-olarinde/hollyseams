import { Inject, Injectable } from "@nestjs/common";

import { ApiError } from "../../common/http/api-response";
import { userTable } from "../../database";
import { DRIZZLE, type Database } from "../../database/database.module";
import { PinHasherService } from "./pin-hasher.service";
import { SessionStore } from "./session.store";

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly hasher: PinHasherService,
    private readonly sessions: SessionStore,
  ) {}

  async login(pin: string): Promise<string> {
    const [user] = await this.db
      .select({ id: userTable.id, pinHash: userTable.pinHash })
      .from(userTable);

    if (!user) {
      throw new ApiError(401, "Incorrect PIN. Try again.");
    }

    const validPin = await this.hasher.verifyPin(pin, user.pinHash);
    if (!validPin) throw new ApiError(401, "Incorrect PIN. Try again.");

    return await this.sessions.issue(user.id);
  }
}
