import { Global, Module } from "@nestjs/common";

import { ENV, parseEnv, type Env } from "./env.schema";

/**
 * THE ONE CAVEAT: `.env` loading is now Bun's job. If this app ever runs on plain Node
 * (`node dist/main.js`) instead of Bun, add `dotenv` back — Node does not read `.env`.
 */

@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: (): Env => parseEnv(),
    },
  ],
  exports: [ENV],
})
export class ConfigModule {}
