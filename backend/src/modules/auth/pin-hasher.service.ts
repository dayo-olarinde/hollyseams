import { Inject, Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { ENV, type Env } from "../../config/env.schema";

@Injectable()
export class PinHasherService {
  private static readonly ARGON2_OPTIONS = {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  } as const;

  constructor(@Inject(ENV) private readonly env: Env) {}

  private withPepper(pin: string): string {
    return `${pin}:${this.env.PEPPER}`;
  }

  hashPin(pin: string): Promise<string> {
    return hash(this.withPepper(pin), PinHasherService.ARGON2_OPTIONS);
  }

  verifyPin(pin: string, pinHash: string): Promise<boolean> {
    return verify(pinHash, this.withPepper(pin));
  }

  private static readonly DUMMY_PIN_HASH =
    "$argon2id$v=19$m=65536,t=3,p=1$B0q18TuNpOCwnsdu2AnfAw$kvB/NxjkDW2dZLls1y1pYaMBw/Q8iudXOeZylHAS5Uk";

  private static readonly DUMMY_INPUT = "timing-equalizer";

  dummyVerify(): Promise<boolean> {
    return verify(
      PinHasherService.DUMMY_PIN_HASH,
      this.withPepper(PinHasherService.DUMMY_INPUT),
    );
  }
}
