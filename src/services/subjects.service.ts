import { desc, eq } from "drizzle-orm";
import { db } from "../config/db";
import { customersTable, measurementsTable, subjectsTable } from "../db";
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

export const listMeasurements = async (subjectId: string) => {
  return db
    .select({
      id: measurementsTable.id,
      subjectId: measurementsTable.subjectId,
      measurements: measurementsTable.measurements,
      date: measurementsTable.date,
    })
    .from(measurementsTable)
    .where(eq(measurementsTable.subjectId, subjectId))
    .orderBy(desc(measurementsTable.date));
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
