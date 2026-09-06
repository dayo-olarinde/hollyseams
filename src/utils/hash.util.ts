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
