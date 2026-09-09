import type { SessionData } from "../validations/session.validation";

declare global {
  namespace Express {
    interface Request {
      user?: SessionData;
    }
  }
}

export {};
