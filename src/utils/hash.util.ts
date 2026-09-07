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

const DUMMY_PIN_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$B0q18TuNpOCwnsdu2AnfAw$kvB/NxjkDW2dZLls1y1pYaMBw/Q8iudXOeZylHAS5Uk";

const DUMMY_INPUT = "timing-equalizer";

export const dummyVerify = (): Promise<boolean> =>
  verify(DUMMY_PIN_HASH, withPepper(DUMMY_INPUT));
