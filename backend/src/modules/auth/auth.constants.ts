export const SESSION_COOKIE = "sessionId";

export const sessionKey = (sessionId: string): string => `session:${sessionId}`;

export const LOGIN_RATE_LIMIT = {
  key: "login",
  limit: 5,
  windowMinutes: 15,
  message: "Too many login attempts. Wait 15 minutes.",
} as const;
