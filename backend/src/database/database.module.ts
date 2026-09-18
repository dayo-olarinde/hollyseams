import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ENV, type Env } from "../config/env.schema";
import * as schema from "./index";

const sqlLogger = new Logger("SQL");

export const PG_CLIENT = Symbol("PG_CLIENT");
export const DRIZZLE = Symbol("DRIZZLE");

export type PgClient = ReturnType<typeof postgres>;
export type Database = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: PG_CLIENT,
      useFactory: (env: Env): PgClient =>
        postgres(env.DATABASE_URL, {
          max: env.DATABASE_MAX_CONNECTIONS,
          prepare: true,
          onnotice: () => {},
        }),
      inject: [ENV],
    },
    {
      provide: DRIZZLE,
      useFactory: (pgClient: PgClient, env: Env): Database =>
        drizzle(pgClient, {
          schema,
          logger:
            env.NODE_ENV === "development"
              ? { logQuery: (query: string) => sqlLogger.debug(query) }
              : false,
        }),
      inject: [PG_CLIENT, ENV],
    },
  ],
  exports: [PG_CLIENT, DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(PG_CLIENT) private readonly pg: PgClient) {}

  async onApplicationShutdown(): Promise<void> {
    this.logger.log("Closing database connection...");
    await this.pg.end();
  }
}
