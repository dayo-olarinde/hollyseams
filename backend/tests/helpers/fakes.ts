import { getTableName } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import postgres from "postgres";

import type { CloudinaryClient } from "../../src/media/cloudinary.service";
import type { PhotoCleanupService } from "../../src/media/photo-cleanup.service";
import type { RedisClient } from "../../src/redis/redis.module";
import type { Database, PgClient } from "../../src/database/database.module";

/**
 * In-memory infrastructure doubles for tests.
 *
 * Express bridge: singleton imports required module mocking or real connections. Nest's
 * DI tokens let tests provide fakes before the real providers are constructed. Each fake
 * implements only the operations production code uses, so a new dependency call is
 * visible in the test instead of silently reaching a live service.
 */

interface FakeRedisOptions {
  /** Initial values using the same Redis keys the provider receives. */
  seed?: Record<string, string>;
}

export class FakeRedis {
  readonly store = new Map<string, string>();
  readonly expiries = new Map<string, number>();
  readonly calls: string[] = [];

  constructor(options: FakeRedisOptions = {}) {
    for (const [key, value] of Object.entries(options.seed ?? {})) {
      this.store.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    this.calls.push(`get:${key}`);
    return this.store.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    mode?: string,
    ttl?: number,
  ): Promise<string> {
    // Record mode and TTL so tests can prove sessions are written with an expiry.
    this.calls.push(`set:${key}:${mode ?? ""}:${ttl ?? ""}`);
    this.store.set(key, value);
    return "OK";
  }

  async del(key: string): Promise<number> {
    this.calls.push(`del:${key}`);
    this.expiries.delete(key);
    return this.store.delete(key) ? 1 : 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.calls.push(`expire:${key}:${seconds}`);
    this.expiries.set(key, seconds);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    return this.expiries.get(key) ?? -1;
  }

  /** Minimal fixed-window counter used by `RateLimiterService`. */
  async incr(key: string): Promise<number> {
    const next = Number(this.store.get(key) ?? "0") + 1;
    this.store.set(key, String(next));
    return next;
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  async quit(): Promise<string> {
    return "OK";
  }

  /** Expose this double through the production client type at the test boundary. */
  asClient(): RedisClient {
    return this as unknown as RedisClient;
  }
}

/**
 * Minimal Drizzle double for the query used by `AuthService`.
 * One row models the current single-user database; an empty array tests the no-user
 * branch and its non-enumerating 401 response.
 */
export const fakeDatabase = (
  rows: ReadonlyArray<{ id: string; pinHash: string }>,
): Database =>
  ({
    select: () => ({
      from: () => Promise.resolve([...rows]),
    }),
  }) as unknown as Database;

/**
 * Chainable Drizzle double for feature queries (customers, subjects, jobs...).
 *
 * Express bridge: `vi.mock("../config/db")` replaced the whole module. Here the fake is
 * handed to one DI token, and the same shape works for any feature that injects `DRIZZLE`.
 *
 * A real Drizzle query is a builder ending in `await` (`.where(...)`) or a promise
 * (`.limit(...)`, `.returning()`), so each fake chain is *thenable* as well as chainable.
 *
 * Rows are canned per operation (`selectRows`/`insertRows`/`updateRows`), which is enough for a
 * test that performs one action. A flow that touches several tables — the jobs create does four
 * inserts, and a job detail reads jobs + payments — needs different rows per table, so
 * `rowsByTable` keys the same canned rows by table name and takes precedence when a table is
 * listed. Without it, every statement in such a flow would return the same row.
 *
 * `calls` records *which* query was built — `where:none` versus `where:keyset`, and
 * `limit:11` for a page of 10 — so a test can prove pagination behavior without a database.
 *
 * `select(projection)` is honored: rows are trimmed to the selected columns, exactly like
 * the real builder. Without that, a test could not tell a three-column detail response from
 * a request that leaked the whole row.
 */
type Rows = Record<string, unknown>[];

interface FakeChain {
  from(table?: unknown): FakeChain;
  innerJoin(table?: unknown, condition?: unknown): FakeChain;
  where(condition?: unknown): FakeChain;
  orderBy(...columns: unknown[]): FakeChain;
  limit(count: number): Promise<Rows>;
  for(strength: string): FakeChain;
  onConflictDoNothing(target?: unknown): FakeChain;
  values(data: Record<string, unknown>): FakeChain;
  set(data: Record<string, unknown>): FakeChain;
  returning(): Promise<Rows>;
  then(
    onfulfilled: (value: Rows) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ): Promise<unknown>;
}

export interface FakeDbOptions {
  /**
   * When set, every statement rejects with this error instead of resolving.
   *
   * The fake's way of making Postgres fail: pass `postgresFailure("23503")` and the request
   * under test hits the real exception filter with the same error shape the driver produces —
   * without a database and without provoking a constraint violation.
   */
  failWith?: unknown;
  /** Rows every `select(...)` resolves with. Empty means "no row found". */
  selectRows?: Rows;
  /** Rows every `insert(...).values(...).returning()` resolves with. */
  insertRows?: Rows;
  /** Rows every `update(...).set(...)...returning()` resolves with. */
  updateRows?: Rows;
  /**
   * Rows per table name, for flows that span tables — `{ jobs: [jobRow], payments: [] }`.
   *
   * Applies to `select().from(table)`, `insert(table)` and `update(table)`; a table that is not
   * listed falls back to the option above. One table cannot return two different answers within
   * a single test — unless `rowSequences` scripts them — which is why the fakes below are
   * described as doubles rather than simulators.
   */
  rowsByTable?: Record<string, Rows>;
  /**
   * Answers for consecutive **reads** of one table, consumed in order and then falling back to
   * `rowsByTable`/`selectRows`.
   *
   * One canned answer per table covers every flow whose statements read a table once. The
   * duplicate-key fallback in `createPayment` is the deliberate exception: its first read of
   * `payments` must return nothing (nothing is recorded yet), while its second read — after
   * `ON CONFLICT DO NOTHING` reports a duplicate — must return the row the concurrent winner
   * wrote. Same table, two different answers, and the difference is the behaviour under test.
   */
  rowSequences?: Record<string, Rows[]>;
}

export interface FakeDbHandle {
  /** Pass to `overrideProvider(DRIZZLE).useValue(handle.db)`. */
  db: Database;
  /** Query steps in order, e.g. `select`, `where:keyset`, `limit:11`. */
  calls: string[];
  /** Objects handed to `.values(...)`, so column-level behavior can be asserted. */
  inserted: Record<string, unknown>[];
  /** Objects handed to `.set(...)`. */
  updated: Record<string, unknown>[];
}

export const fakeQueryDb = (options: FakeDbOptions = {}): FakeDbHandle => {
  const calls: string[] = [];
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];

  /**
   * Resolve the canned rows lazily: which rows a `select` reads depends on the table, and the
   * table only arrives when `.from(table)` runs. `tableName` carries it into the terminators.
   */
  const chain = (
    resolve: (tableName?: string) => Rows,
    tableName?: string,
  ): FakeChain => {
    /** Every terminator settles through here, so `failWith` applies to the whole query. */
    const settle = (): Promise<Rows> =>
      options.failWith !== undefined
        ? Promise.reject(options.failWith)
        : Promise.resolve(resolve(tableName));

    const self: FakeChain = {
      from: (table) => {
        if (!table) return self;

        const name = getTableName(table as never);
        calls.push(`from:${name}`);

        return chain(resolve, name);
      },
      // Joins are recorded, not simulated: the row the fake returns already has the joined
      // columns projected into it, which is all the code under test reads.
      innerJoin: (table) => {
        const name = nameOf(table);
        if (name) calls.push(`join:${name}`);
        return self;
      },
      where: (condition) => {
        // A missing condition means "first page": no keyset filter was applied.
        calls.push(condition === undefined ? "where:none" : "where:keyset");
        return self;
      },
      orderBy: () => self,
      limit: (count) => {
        calls.push(`limit:${count}`);
        return settle();
      },
      // Row-level locks. Recorded so a test can prove the read that a write depends on is
      // actually locked (`for:share`) rather than racing another transaction.
      for: (strength) => {
        calls.push(`for:${strength}`);
        return self;
      },
      // The conflict-tolerant insert idempotent payment creation needs. Recording the target
      // column lets a test prove the deduplication rides on the unique index
      // (`onConflict:idempotency_key`) instead of on the read that merely preceded it.
      // Drizzle takes a config object (`{ target }`) and names the column `.name`.
      onConflictDoNothing: (config) => {
        const column = (config as { target?: { name?: string } } | undefined)?.target
          ?.name;
        calls.push(column ? `onConflict:${column}` : "onConflict");
        return self;
      },
      values: (data) => {
        inserted.push(data);
        return self;
      },
      set: (data) => {
        updated.push(data);
        return self;
      },
      returning: () => settle(),
      // Makes `await db.select()...where(...)` resolve, like the real builder.
      then: (onfulfilled, onrejected) => settle().then(onfulfilled, onrejected),
    };
    return self;
  };

  /** `rowsByTable` wins when it names the table; otherwise the flat option applies. */
  const rowsFor = (tableName: string | undefined, fallback: Rows): Rows =>
    (tableName ? options.rowsByTable?.[tableName] : undefined) ?? fallback;

  /** Table name of a builder argument, so `calls` records which table was touched. */
  const nameOf = (table: unknown): string | undefined =>
    table ? getTableName(table as never) : undefined;

  /** Keep only the keys the caller selected, like Drizzle's projection does. */
  const project = (
    rows: Rows,
    projection: Record<string, unknown> | undefined,
  ): Rows => {
    if (!projection) return rows;

    const keys = Object.keys(projection);
    return rows.map((row) =>
      Object.fromEntries(keys.map((key) => [key, row[key]])),
    );
  };

  const db = {
    select: (projection?: Record<string, unknown>) => {
      calls.push("select");
      return chain((tableName) => {
        // Scripted reads win over the canned row, but only for `select` — an insert into the
        // same table must still see `rowsByTable` (see `rowSequences`).
        const queued = tableName ? options.rowSequences?.[tableName] : undefined;
        if (queued?.length) return project(queued.shift()!, projection);

        return project(rowsFor(tableName, options.selectRows ?? []), projection);
      });
    },
    insert: (table?: unknown) => {
      calls.push("insert");
      const into = nameOf(table);
      if (into) calls.push(`into:${into}`);

      return chain(() => rowsFor(into, options.insertRows ?? []));
    },
    update: (table?: unknown) => {
      calls.push("update");
      const target = nameOf(table);
      if (target) calls.push(`update:${target}`);

      return chain(() => rowsFor(target, options.updateRows ?? []));
    },
    delete: (table?: unknown) => {
      calls.push("delete");
      const target = nameOf(table);
      if (target) calls.push(`delete:${target}`);

      // A DELETE resolves from `rowsByTable` (the row it removed) and from nothing else:
      // without an entry, `returning()` yields no rows, which is what "nothing was deleted"
      // looks like to the caller.
      return chain(() => rowsFor(target, []));
    },
    /**
     * Runs the callback against the same double and records the boundary.
     *
     * A real transaction hands the callback a `tx` handle bound to one connection. This
     * double passes itself, so the queries inside a transaction are recorded in the same
     * `calls` list as the ones outside it — which is enough to assert *that* a unit of work
     * was opened and in what order the statements ran. Rollback is not simulated: a test
     * that needs it should assert the thrown error instead.
     */
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      calls.push("transaction");
      return callback(db);
    },
  } as unknown as Database;

  return { db, calls, inserted, updated };
};

export interface FakeCloudinaryOptions {
  /** Public ids the provider should report as missing (HTTP 404 from Cloudinary). */
  missing?: string[];
  /** When true every lookup fails with a non-404 provider error, to test the 502 path. */
  providerDown?: boolean;
  /** When true every `destroy` call rejects, the way a provider outage refuses a delete. */
  destroyFails?: boolean;
  /** What a found asset reports. Defaults describe a valid 1 KB JPEG inside the app's folder. */
  format?: string;
  bytes?: number;
}

export interface FakeCloudinaryHandle {
  /** Pass to `overrideProvider(CLOUDINARY).useValue(handle.client)`. */
  client: CloudinaryClient;
  /** Public ids that were looked up, in order — proof the API verified instead of trusting. */
  verified: string[];
  /** Public ids that were released after a write succeeded. */
  destroyed: string[];
}

/**
 * Image-provider double: no network, no credentials, no uploaded asset.
 *
 * Express bridge: `verifyAndResolvePhotos` called the Cloudinary SDK directly from the service,
 * so any test of a photo path needed a live account or a module mock. `CLOUDINARY` is a provider
 * token here, so the SDK is replaced inside the graph and the *real* `CloudinaryService` — folder
 * check, format check, size check, error mapping — is what runs under test.
 *
 * A found asset echoes the requested `publicId` back as `public_id`, which is what the real API
 * does: Cloudinary's ids include the folder, which is why tests pass `hollyseams/photos/<name>`
 * to satisfy the folder check and `elsewhere/<name>` to fail it.
 */
export const fakeCloudinary = (
  options: FakeCloudinaryOptions = {},
): FakeCloudinaryHandle => {
  const verified: string[] = [];
  const destroyed: string[] = [];
  const {
    missing = [],
    providerDown = false,
    destroyFails = false,
    format = "jpg",
    bytes = 1024,
  } = options;

  const client = {
    api: {
      resource: async (publicId: string, _params?: unknown) => {
        verified.push(publicId);

        if (providerDown) {
          // The SDK throws the provider's own error object; only `http_code` is read.
          throw { http_code: 500, message: "provider unavailable" };
        }

        if (missing.includes(publicId)) {
          throw { http_code: 404, message: "not found" };
        }

        return {
          public_id: publicId,
          format,
          bytes,
          secure_url: `https://res.cloudinary.com/test-cloud/image/upload/${publicId}.${format}`,
        };
      },
    },
    uploader: {
      destroy: async (publicId: string) => {
        destroyed.push(publicId);
        if (destroyFails) throw { http_code: 500, message: "deletion refused" };
        return { result: "ok" };
      },
    },
    utils: {
      // The real signing algorithm is exercised by the tests that keep the real SDK instead.
      api_sign_request: () => "fake-signature",
    },
    config: () => undefined,
  } as unknown as CloudinaryClient;

  return { client, verified, destroyed };
};

export interface FakePhotoCleanupHandle {
  /** Pass to `overrideProvider(PhotoCleanupService).useValue(handle.service)`. */
  service: PhotoCleanupService;
  /** Public ids handed to the queue, in order — proof the delete left the request path. */
  enqueued: string[];
}

/**
 * Queue double: records what would have been queued instead of opening a BullMQ connection.
 *
 * Needed by every test that boots `AppModule`, because the real service builds a Queue and a
 * Worker in its constructor and both dial Redis on construction. Replacing the provider keeps
 * the suite offline and changes the assertion: "the photo was destroyed inline" becomes "the
 * photo id was queued".
 */
export const fakePhotoCleanup = (): FakePhotoCleanupHandle => {
  const enqueued: string[] = [];

  const service = {
    enqueueDestroy: async (publicIds: string[]) => {
      enqueued.push(...publicIds);
    },
  } as unknown as PhotoCleanupService;

  return { service, enqueued };
};

/** One raw statement a double received, with the values the tagged template passed. */
export interface FakePgQuery {
  /** The SQL text, whitespace collapsed, with `?` where the interpolated values go. */
  sql: string;
  params: unknown[];
}

export interface FakePgOptions {
  /** Fail every statement, as a database that is down — not one query, the whole server. */
  failPing?: boolean;
  /**
   * Answer a raw statement. Return the rows the query should produce.
   *
   * Raw SQL cannot be stubbed per method the way the Drizzle double is, because the service
   * sends text rather than a builder: the double has to read the SQL it was handed and decide.
   */
  onQuery?: (sql: string, params: readonly unknown[]) => unknown[];
}

/** The Postgres double, plus what it was asked, so a test can assert the statement itself. */
export type FakePgClient = PgClient & { queries: FakePgQuery[] };

/**
 * PostgreSQL double for raw-SQL features (`/health`, the reports) and Nest shutdown (`end()`).
 *
 * `queries` records the text and parameters of every statement, which is how a test proves a
 * report still runs *that* query — the aggregates were ported verbatim from the Express app,
 * and a rewrite that happens to return the right shape would otherwise go unnoticed.
 */
export const fakePgClient = (options: FakePgOptions = {}): FakePgClient => {
  const queries: FakePgQuery[] = [];

  const client = (...args: unknown[]): Promise<unknown[]> => {
    // postgres.js calls a tagged template as `(strings, ...values)`. Joining the literal
    // fragments with `?` reproduces the statement as Postgres sees it — values replaced by
    // placeholders — and collapsing whitespace keeps the recorded text assertable.
    const [strings, ...params] = args as [TemplateStringsArray, ...unknown[]];
    const sql = Array.from(strings).join("?").replace(/\s+/g, " ").trim();
    queries.push({ sql, params });

    if (options.failPing) return Promise.reject(new Error("database is down"));

    return Promise.resolve(options.onQuery?.(sql, params) ?? []);
  };

  return Object.assign(client, {
    queries,
    end: async (): Promise<void> => undefined,
  }) as unknown as FakePgClient;
};

/**
 * A driver failure shaped exactly as Postgres reports it, wrapped the way Drizzle wraps it.
 *
 * The wrapping is the point. `unwrapDbError` exists because a failing query does not arrive as
 * `PostgresError` — Drizzle throws `DrizzleQueryError` and hides the driver error on `cause`,
 * so a test that threw a bare `PostgresError` would pass while production failed.
 *
 * `PostgresError` cannot be constructed directly (its `.d.ts` declares no constructor), so the
 * object is created from the real prototype and given the fields Postgres actually fills in.
 * `instanceof postgres.PostgresError` is therefore genuinely true.
 */
export const postgresFailure = (options: {
  code: string;
  detail?: string;
  sql?: string;
}): DrizzleQueryError => {
  const pgError = Object.assign(
    Object.create(postgres.PostgresError.prototype) as Error,
    { code: options.code, ...(options.detail && { detail: options.detail }) },
  );

  // The wrapper's message contains the SQL and the parameters — which is precisely what must
  // never reach a client, so tests get to assert that it does not.
  return new DrizzleQueryError(
    options.sql ?? "insert into \"measurements\" (\"subject_id\") values ($1)",
    ["34ed3eac-0f3d-4a80-96e5-bad792cfb1e2"],
    pgError,
  );
};
