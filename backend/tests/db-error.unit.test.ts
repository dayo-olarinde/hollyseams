import postgres from "postgres";
import { describe, expect, it } from "vitest";

import { ApiError } from "../src/common/http/api-response";
import {
  asPostgresError,
  mapPostgresError,
  unwrapDbError,
} from "../src/database/db-error";
import { postgresFailure } from "./helpers/fakes";

/**
 * Unit tests for the Postgres-error mapping.
 *
 * No HTTP request and no database: these pin the two decisions the filter depends on — which
 * driver error is hiding in a wrapper, and what a client is allowed to be told about it.
 */

describe("unwrapDbError", () => {
  it("finds the Postgres error Drizzle hides on `cause`", () => {
    const wrapped = postgresFailure({ code: "23503" });

    // The wrapper is what a `catch` block actually receives: an Error, but not the driver's.
    expect(wrapped.constructor.name).toBe("DrizzleQueryError");
    expect(wrapped).not.toBeInstanceOf(postgres.PostgresError);

    // The driver error is one level in.
    expect(asPostgresError(wrapped)?.code).toBe("23503");
  });

  it("keeps following `cause` through more than one wrapper", () => {
    // Nothing in the app nests twice today, but a future wrapper must not defeat the mapping.
    const nested = new Error("outer wrapper", {
      cause: postgresFailure({ code: "22P02" }),
    });

    expect(asPostgresError(nested)?.code).toBe("22P02");
  });

  it("returns the error untouched when nothing wraps a Postgres error", () => {
    const apiError = new ApiError(404, "Customer not found");
    const plain = new Error("boom");

    // An ApiError carries no `cause`, so it is handed straight back...
    expect(unwrapDbError(apiError)).toBe(apiError);

    // ...and a non-Error (a thrown string, an SDK error object) is not dereferenced at all.
    expect(unwrapDbError("thrown string")).toBe("thrown string");
    expect(asPostgresError(plain)).toBeNull();
    expect(asPostgresError("thrown string")).toBeNull();
  });
});

describe("mapPostgresError", () => {
  it("maps a foreign key violation to 400 and never repeats the query", () => {
    const mapped = mapPostgresError(postgresFailure({ code: "23503" }));

    expect(mapped).toEqual({
      statusCode: 400,
      message: "Referenced record does not exist.",
      code: "23503",
    });

    // The whole reason the wrapper exists: its message contains the SQL and the parameter
    // values. If that ever leaks into a response, this fails.
    expect(mapped!.message).not.toContain("insert into");
    expect(mapped!.message).not.toContain("34ed3eac");
  });

  it("maps a unique violation to 409 naming the column from the detail line", () => {
    const mapped = mapPostgresError(
      postgresFailure({
        code: "23505",
        detail: "Key (name)=(Ada Obi) already exists.",
      }),
    );

    // Postgres reports the offending key in `detail`; turning it into a message is what lets
    // a form highlight the field instead of showing "conflict".
    expect(mapped).toEqual({
      statusCode: 409,
      message: "This name is already in use.",
      code: "23505",
    });
  });

  it("reads a composite key as 'a and b' and degrades gracefully with no detail", () => {
    expect(
      mapPostgresError(
        postgresFailure({ code: "23505", detail: "Key (a, b)=(1, 2) already exists." }),
      )?.message,
    ).toBe("This a and b is already in use.");

    expect(mapPostgresError(postgresFailure({ code: "23505" }))?.message).toBe(
      "This record is already in use.",
    );
  });

  it("maps a malformed uuid (22P02) to 400", () => {
    expect(mapPostgresError(postgresFailure({ code: "22P02" }))).toEqual({
      statusCode: 400,
      message: "Invalid data format provided.",
      code: "22P02",
    });
  });

  it("keeps an unhandled SQLSTATE as a 500 with no internal detail", () => {
    // e.g. 57014 = query canceled, or a failure the app has no answer for.
    const mapped = mapPostgresError(postgresFailure({ code: "57014" }));

    expect(mapped).toEqual({
      statusCode: 500,
      message: "A database error occurred.",
      code: "57014",
    });
  });

  it("returns null for anything that is not a database failure", () => {
    // This null is what lets the filter fall through to its HttpException and 404 branches.
    expect(mapPostgresError(new ApiError(401, "Not authenticated"))).toBeNull();
    expect(mapPostgresError(new Error("boom"))).toBeNull();
    expect(mapPostgresError(undefined)).toBeNull();
  });
});
