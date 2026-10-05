export const SESSION_COOKIE = "sessionId";

export const sessionKey = (sessionId: string): string => `session:${sessionId}`;

/**
 * Fixed window over ALL login attempts. The key is a global string, not `ip:` or an
 * account id — deliberate: this is a single-user app, so there is exactly one credential
 * to protect and one bucket is the honest count of attempts against it.
 *
 * `limit: 5` because the credential is a 4-digit PIN (10 000 combinations): 5 tries per
 * 15-minute window caps an online brute force at 480 tries/hour before the lockout in
 * LOGIN_LOCKOUT even kicks in.
 */
export const LOGIN_RATE_LIMIT = {
  key: "login",
  limit: 5,
  windowMinutes: 15,
  message: "Too many login attempts. Wait 15 minutes.",
} as const;

/**
 * ATM-card-style lockout: after `threshold` consecutive wrong PINs, login is frozen for
 * an exponentially growing pause — 30s, 60s, 120s … capped at `maxSeconds`. Like a bank
 * card, the keys are global on purpose (single account; a per-IP lock would let an
 * attacker with many IPs walk around it).
 *
 * - `failWindowSeconds` (60 min) must outlive the 15-min attempt window, otherwise the
 *   streak would expire at the same moment the window resets and the delay could never
 *   escalate past the first lock.
 * - A correct PIN clears the streak and the lock (AuthService.login).
 *
 * ponytail: global lock — an attacker can also freeze the owner out (same trade an ATM
 * card makes; accepted for a single-user PIN). Per-account locks if the app ever becomes
 * multi-tenant.
 */
export const LOGIN_LOCKOUT = {
  failKey: "login:fail",
  lockKey: "login:lock",
  threshold: 4, // consecutive wrong PINs before the first lock
  baseSeconds: 30, // first lock duration; doubles per failure past the threshold
  maxSeconds: 3600, // ceiling for the doubling
  failWindowSeconds: 60 * 60, // how long a failure streak stays alive
  message: "Too many incorrect PINs. Login is temporarily locked.",
} as const;
