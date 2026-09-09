import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { ApiError } from "./apiResponse";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const splitCursor = (cursor: string): { value: string; id: string } => {
  const separatorIndex = cursor.lastIndexOf("|");
  if (separatorIndex === -1) {
    throw new ApiError(400, "Invalid pagination cursor");
  }

  const value = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 1);

  if (!value || !UUID_PATTERN.test(id)) {
    throw new ApiError(400, "Invalid pagination cursor");
  }

  return { value, id };
};

type CursorMode = "timestamptz" | "text" | "numeric" | "date";
type CursorDirection = "<" | ">";

export const keysetCondition = (
  sortColumn: SQLWrapper,
  idColumn: SQLWrapper,
  cursor: string,
  mode: CursorMode = "timestamptz",
  direction: CursorDirection = "<",
): SQL => {
  const { value, id } = splitCursor(cursor);

  if (mode === "timestamptz" && Number.isNaN(Date.parse(value))) {
    throw new ApiError(400, "Invalid pagination cursor");
  }
  if (mode === "date" && Number.isNaN(Date.parse(value))) {
    throw new ApiError(400, "Invalid pagination cursor");
  }
  if (mode === "numeric" && !Number.isFinite(Number(value))) {
    throw new ApiError(400, "Invalid pagination cursor");
  }

  const valueExpr =
    mode === "timestamptz"
      ? sql`(${value})::timestamptz`
      : mode === "numeric"
        ? sql`(${value})::numeric`
        : mode === "date"
          ? sql`(${value})::date`
          : sql`${value}`;

  return sql`(${sortColumn}, ${idColumn}) ${sql.raw(direction)} (${valueExpr}, ${id})`;
};
