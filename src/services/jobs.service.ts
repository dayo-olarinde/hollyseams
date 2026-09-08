import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../config/db";
import {
  customersTable,
  jobsTable,
  measurementsTable,
  paymentsTable,
  subjectsTable,
} from "../db";
import { ApiError } from "../utils/apiResponse";
import { keysetCondition } from "../utils/cursor";
import type { ListItemsQuery } from "../validations/customers.validation";
import type {
  CreateJobForSubjectInput,
  CreateJobNewCustomerInput,
  UpdateJobInput,
} from "../validations/jobs.validation";
import type { CreatePaymentInput } from "../validations/payments.validation";

export const listJobs = async (
  { cursor, limit }: ListItemsQuery = { limit: 10 },
) => {
  const rows = await db
    .select({
      id: jobsTable.id,
      subjectId: jobsTable.subjectId,
      subjectName: subjectsTable.name,
      measurementId: jobsTable.measurementId,
      styleRef: jobsTable.styleRef,
      finishedJob: jobsTable.finishedJob,
      agreedPrice: jobsTable.agreedPrice,
      status: jobsTable.status,
      dueDate: jobsTable.dueDate,
      deliveredAt: jobsTable.deliveredAt,
      createdAt: jobsTable.createdAt,
    })
    .from(jobsTable)
    .innerJoin(subjectsTable, eq(jobsTable.subjectId, subjectsTable.id))
    .where(
      cursor
        ? keysetCondition(jobsTable.createdAt, jobsTable.id, cursor)
        : undefined,
    )
    .orderBy(desc(jobsTable.createdAt), desc(jobsTable.id))
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

export const listCustomerJobs = async (
  customerId: string,
  query: ListItemsQuery,
) => {
  const { cursor, limit } = query;

  const rows = await db
    .select({
      id: jobsTable.id,
      subjectId: jobsTable.subjectId,
      subjectName: subjectsTable.name,
      measurementId: jobsTable.measurementId,
      styleRef: jobsTable.styleRef,
      finishedJob: jobsTable.finishedJob,
      agreedPrice: jobsTable.agreedPrice,
      status: jobsTable.status,
      dueDate: jobsTable.dueDate,
      deliveredAt: jobsTable.deliveredAt,
      createdAt: jobsTable.createdAt,
    })
    .from(jobsTable)
    .innerJoin(subjectsTable, eq(jobsTable.subjectId, subjectsTable.id))
    .where(
      and(
        eq(jobsTable.customerId, customerId),
        cursor
          ? keysetCondition(jobsTable.createdAt, jobsTable.id, cursor)
          : undefined,
      ),
    )
    .orderBy(desc(jobsTable.createdAt), desc(jobsTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  console.log(rows);

  return {
    items,
    nextCursor:
      hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
};

export const getJob = async (id: string) => {
  const [job, payments] = await Promise.all([
    db
      .select({
        id: jobsTable.id,
        customerId: customersTable.id,
        customerPhone: customersTable.phoneNumber,
        subjectId: subjectsTable.id,
        subjectName: sql<string>`
        case when ${subjectsTable.relationship} = 'self'
          then ${customersTable.name}
          else ${subjectsTable.name}
        end`,
        measurementsId: measurementsTable.id,
        measurements: measurementsTable.measurements,
        styleRef: jobsTable.styleRef,
        finishedJob: jobsTable.finishedJob,
        agreedPrice: jobsTable.agreedPrice,
        status: jobsTable.status,
        dueDate: jobsTable.dueDate,
        deliveredAt: jobsTable.deliveredAt,
        createdAt: jobsTable.createdAt,
      })
      .from(jobsTable)
      .innerJoin(customersTable, eq(jobsTable.customerId, customersTable.id))
      .innerJoin(subjectsTable, eq(jobsTable.subjectId, subjectsTable.id))
      .innerJoin(
        measurementsTable,
        eq(jobsTable.measurementId, measurementsTable.id),
      )
      .where(eq(jobsTable.id, id)),

    db
      .select({
        id: paymentsTable.id,
        amount: paymentsTable.amount,
        paidAt: paymentsTable.paidAt,
      })
      .from(paymentsTable)
      .where(eq(paymentsTable.jobId, id))
      .orderBy(desc(paymentsTable.paidAt)),
  ]);

  if (!job) throw new ApiError(404, "Job not found");

  return { ...job, payments };
};

export const createJobNewCustomer = async (data: CreateJobNewCustomerInput) => {
  const { customer: customerData, subjects, job: jobData } = data;
  const subjectData = subjects[0]!;

  const job = await db.transaction(async (tx) => {
    const [customer] = await tx
      .insert(customersTable)
      .values({
        name: customerData.name,
        ...(customerData.phoneNumber !== undefined && {
          phoneNumber: customerData.phoneNumber,
        }),
      })
      .returning();

    if (!customer) throw new ApiError(500, "Failed to create customer");

    const subjectName =
      subjectData.relationship === "self" ? customer.name : subjectData.name!;

    const [subject] = await tx
      .insert(subjectsTable)
      .values({
        customerId: customer.id,
        name: subjectName,
        relationship: subjectData.relationship,
      })
      .returning();

    if (!subject) throw new ApiError(500, "Failed to create subject");

    const [measurement] = await tx
      .insert(measurementsTable)
      .values({
        subjectId: subject.id,
        measurements: subjectData.measurements,
        date: new Date(),
      })
      .returning();

    if (!measurement) throw new ApiError(500, "Failed to create measurement");

    const [newJob] = await tx
      .insert(jobsTable)
      .values({
        customerId: customer.id,
        subjectId: subject.id,
        measurementId: measurement.id,
        ...jobData,
      })
      .returning();

    if (!newJob) throw new ApiError(500, "Failed to create job");

    return newJob;
  });

  return job;
};

export const createJobForSubject = async (
  subjectId: string,
  data: CreateJobForSubjectInput,
) => {
  const { measurementId, job: jobData } = data;

  const job = await db.transaction(async (tx) => {
    const [subject] = await tx
      .select({ id: subjectsTable.id, customerId: subjectsTable.customerId })
      .from(subjectsTable)
      .where(eq(subjectsTable.id, subjectId));

    if (!subject) throw new ApiError(404, "Subject not found");

    const [measurement] = await tx
      .select({ id: measurementsTable.id })
      .from(measurementsTable)
      .where(
        and(
          eq(measurementsTable.id, measurementId),
          eq(measurementsTable.subjectId, subjectId),
        ),
      );

    if (!measurement) {
      throw new ApiError(404, "Measurement not found for this subject");
    }

    const [newJob] = await tx
      .insert(jobsTable)
      .values({
        customerId: subject.customerId,
        subjectId: subject.id,
        measurementId,
        ...jobData,
      })
      .returning();

    if (!newJob) throw new ApiError(500, "Failed to create job");

    return newJob;
  });

  return job;
};

export const updateJob = async (id: string, jobData: UpdateJobInput) => {
  if (Object.keys(jobData).length === 0) {
    throw new ApiError(400, "No fields to update");
  }

  const [job] = await db
    .update(jobsTable)
    .set(jobData)
    .where(eq(jobsTable.id, id))
    .returning();

  if (!job) throw new ApiError(404, "Job not found");

  return job;
};

export const deleteJob = async (id: string) => {
  const job = await db.transaction(async (tx) => {
    const [payment] = await tx
      .select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(eq(paymentsTable.jobId, id))
      .limit(1);

    if (payment) {
      throw new ApiError(409, "Job has payments and cannot be deleted");
    }

    const [deletedJob] = await tx
      .delete(jobsTable)
      .where(eq(jobsTable.id, id))
      .returning();

    return deletedJob;
  });

  if (!job) throw new ApiError(404, "Job not found");

  return job;
};

export const createPayment = async (
  jobId: string,
  paymentData: CreatePaymentInput,
) => {
  const payment = await db.transaction(async (tx) => {
    const [job] = await tx
      .select({ id: jobsTable.id })
      .from(jobsTable)
      .where(eq(jobsTable.id, jobId))
      .for("update");

    if (!job) throw new ApiError(404, "Job not found");

    const [newPayment] = await tx
      .insert(paymentsTable)
      .values({
        jobId,
        amount: paymentData.amount,
        paidAt: paymentData.paidAt,
      })
      .returning();

    if (!newPayment) throw new ApiError(500, "Failed to create payment");

    return newPayment;
  });

  return payment;
};
