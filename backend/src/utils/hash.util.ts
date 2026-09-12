import { hash, verify } from "@node-rs/argon2";
import { env } from "../config/env";

const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

const withPepper = (pin: string) => `${pin}:${env.PEPPER}`;

export const hashPin = (pin: string) => hash(withPepper(pin), ARGON2_OPTIONS);

export const verifyPin = (pin: string, pinHash: string) =>
  verify(pinHash, withPepper(pin));

/**
 * Kept, but deliberately NOT wired into the login path.
 *
 * Its purpose is to time-equalize the "no user row exists" branch of loginUser,
 * which today answers in ~0ms while a wrong PIN costs an Argon2 verify. With
 * exactly one seeded user that branch is unreachable in practice, so the extra
 * Argon2 work on every failed login is not worth paying for yet. Wire it into
 * the `if (!user)` branch in services/auth.service.ts (await dummyVerify();
 * then throw the same 401) if this app ever gains a second account.
 */
const DUMMY_PIN_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$B0q18TuNpOCwnsdu2AnfAw$kvB/NxjkDW2dZLls1y1pYaMBw/Q8iudXOeZylHAS5Uk";

const DUMMY_INPUT = "timing-equalizer";

export const dummyVerify = (): Promise<boolean> =>
  verify(DUMMY_PIN_HASH, withPepper(DUMMY_INPUT));
