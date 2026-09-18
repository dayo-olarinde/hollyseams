import postgres from "postgres";

const MAX_CAUSE_DEPTH = 5;

export const unwrapDbError = (error: unknown): unknown => {
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (current instanceof postgres.PostgresError) return current;

    if (!(current instanceof Error) || current.cause === undefined)
      return error;

    current = current.cause;
  }

  return error;
};

/** The Postgres error behind `error`, or `null` when this is not a database failure. */
export const asPostgresError = (
  error: unknown,
): postgres.PostgresError | null => {
  const source = unwrapDbError(error);

  return source instanceof postgres.PostgresError ? source : null;
};

export interface DbErrorMapping {
  statusCode: number;
  message: string;
  code: string;
}

export const mapPostgresError = (error: unknown): DbErrorMapping | null => {
  const pgError = asPostgresError(error);
  if (!pgError) return null;

  switch (pgError.code) {
    case UNIQUE_VIOLATION: {
      const field =
        pgError.detail
          ?.match(/Key \((.*?)\)=/)?.[1]
          ?.replaceAll(", ", " and ") ?? "record";

      return {
        statusCode: 409,
        message: `This ${field} is already in use.`,
        code: pgError.code,
      };
    }

    case FOREIGN_KEY_VIOLATION:
      return {
        statusCode: 400,
        message: "Referenced record does not exist.",
        code: pgError.code,
      };

    case INVALID_TEXT_REPRESENTATION:
      return {
        statusCode: 400,
        message: "Invalid data format provided.",
        code: pgError.code,
      };

    default:
      return {
        statusCode: 500,
        // Deliberately unlike ApiError's default "Something went wrong": when a 500 *is* a
        // database failure, saying so is what lets a client (or the person reading a bug
        // report) tell it apart from an application bug. The SQLSTATE itself is logged by the
        // exception filter and never put in the body — see the guide §20.
        message: "A database error occurred.",
        code: pgError.code,
      };
  }
};

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const INVALID_TEXT_REPRESENTATION = "22P02";
