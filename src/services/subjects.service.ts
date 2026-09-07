import { desc, eq } from "drizzle-orm";
import { db } from "../config/db";
import { measurementsTable, subjectsTable } from "../db";
import { ApiError } from "../utils/apiResponse";
import type {
  CreateMeasurementInput,
  CreateSubjectInput,
} from "../validations/subjects.validation";

export const listSubjects = async (customerId: string) => {
  return db
    .select({
      id: subjectsTable.id,
      name: subjectsTable.name,
      relationship: subjectsTable.relationship,
    })
    .from(subjectsTable)
    .where(eq(subjectsTable.customerId, customerId))
    .orderBy(subjectsTable.createdAt);
};

/** Guard used by every handler that receives a subject id in the path. */
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

export const addSubject = async (
  customerId: string,
  subjectData: CreateSubjectInput,
) => {
  const { name, relationship } = subjectData;

  const [subject] = await db
    .insert(subjectsTable)
    .values({
      customerId,
      name,
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

export const listMeasurements = async (subjectId: string) => {
  return db
    .select({
      id: measurementsTable.id,
      subjectId: measurementsTable.subjectId,
      measurements: measurementsTable.measurements,
    })
    .from(measurementsTable)
    .where(eq(measurementsTable.subjectId, subjectId))
    .orderBy(desc(measurementsTable.date));
};
