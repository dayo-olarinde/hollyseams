import { and, desc, eq } from "drizzle-orm";
import { db } from "../config/db";
import { customersTable, measurementsTable, subjectsTable } from "../db";
import { ApiError } from "../utils/apiResponse";
import { keysetCondition } from "../utils/cursor";
import type { ListItemsQuery } from "../validations/customers.validation";
import type {
  CreateMeasurementInput,
  CreateSubjectInput,
} from "../validations/subjects.validation";

export const listSubjects = async (
  customerId: string,
  { cursor, limit }: ListItemsQuery = { limit: 10 },
) => {
  const rows = await db
    .select({
      id: subjectsTable.id,
      name: subjectsTable.name,
      relationship: subjectsTable.relationship,
      createdAt: subjectsTable.createdAt,
    })
    .from(subjectsTable)
    .where(
      and(
        eq(subjectsTable.customerId, customerId),
        cursor
          ? keysetCondition(subjectsTable.createdAt, subjectsTable.id, cursor)
          : undefined,
      ),
    )
    .orderBy(desc(subjectsTable.createdAt), desc(subjectsTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  return {
    items,
    nextCursor:
      hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
};

export const addSubject = async (
  customerId: string,
  subjectData: CreateSubjectInput,
) => {
  const { name, relationship } = subjectData;

  const [customer] = await db
    .select({ name: customersTable.name })
    .from(customersTable)
    .where(eq(customersTable.id, customerId));

  if (!customer) throw new ApiError(404, "Customer not found");

  const subjectName = relationship === "self" ? customer.name : name!;

  const [subject] = await db
    .insert(subjectsTable)
    .values({
      customerId,
      name: subjectName,
      ...(relationship !== undefined && { relationship }),
    })
    .returning();

  if (!subject) throw new ApiError(500, "Failed to create subject");

  return subject;
};

export const createMeasurement = async (
  subjectId: string,
  measurementData: CreateMeasurementInput,
) => {
  const { measurements, date } = measurementData;

  const [newMeasurement] = await db
    .insert(measurementsTable)
    .values({
      subjectId,
      measurements,
      date,
    })
    .returning();

  if (!newMeasurement) throw new ApiError(500, "Failed to create measurements");

  return newMeasurement;
};

export const listMeasurements = async (
  subjectId: string,
  { cursor, limit }: ListItemsQuery = { limit: 10 },
) => {
  const rows = await db
    .select({
      id: measurementsTable.id,
      subjectId: measurementsTable.subjectId,
      measurements: measurementsTable.measurements,
      date: measurementsTable.date,
    })
    .from(measurementsTable)
    .where(
      and(
        eq(measurementsTable.subjectId, subjectId),
        cursor
          ? keysetCondition(
              measurementsTable.date,
              measurementsTable.id,
              cursor,
              "date",
            )
          : undefined,
      ),
    )
    .orderBy(desc(measurementsTable.date), desc(measurementsTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  const toCursorDate = (value: unknown): string => {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value);
  };

  return {
    items,
    nextCursor:
      hasMore && last ? `${toCursorDate(last.date)}|${last.id}` : null,
  };
};

export const getSubject = async (id: string) => {
  const [subject] = await db
    .select({
      id: subjectsTable.id,
      customerId: subjectsTable.customerId,
      name: subjectsTable.name,
      relationship: subjectsTable.relationship,
    })
    .from(subjectsTable)
    .where(eq(subjectsTable.id, id));

  if (!subject) throw new ApiError(404, "Subject not found");

  return subject;
};
