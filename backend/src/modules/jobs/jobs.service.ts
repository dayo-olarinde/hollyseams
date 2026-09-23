import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, sql } from "drizzle-orm";

import { ApiError } from "../../common/http/api-response";
import {
  keysetCondition,
  pageRows,
  type Page,
} from "../../common/pagination/cursor";
import {
  customersTable,
  jobsTable,
  measurementsTable,
  paymentsTable,
  subjectsTable,
} from "../../database";
import { DRIZZLE, type Database } from "../../database/database.module";
import {
  CloudinaryService,
  type ResolvedPhoto,
} from "../../media/cloudinary.service";
import { PhotoCleanupService } from "../../media/photo-cleanup.service";
import { jobStatusFilterCondition } from "./job-status-filter";
import type {
  CreateJobForSubjectDto,
  CreateJobNewCustomerDto,
  JobDataDto,
  ListJobsQuery,
  UpdateJobDto,
} from "./jobs.schema";
import type { CreatePaymentDto } from "./payments.schema";

const jobListSelect = {
  id: jobsTable.id,
  subjectId: jobsTable.subjectId,
  subjectName: subjectsTable.name,
  measurementId: jobsTable.measurementId,
  // Calculate which image URL should be used as the job's cover image.
  coverUrl: sql<string | null>`
    case
      when jsonb_array_length(${jobsTable.finishedJob}) > 0 
        then nullif(${jobsTable.finishedJob}[0] ->> 'url', '')
      when jsonb_array_length(${jobsTable.styleRef}) > 0
        then nullif(${jobsTable.styleRef}[0] ->> 'url', '')
      else null
    end`,
  // Count all images/items in both JSONB arrays.
  photoCount: sql<number>`
    jsonb_array_length(${jobsTable.finishedJob})
    + jsonb_array_length(${jobsTable.styleRef})`,
  description: jobsTable.description,
  agreedPrice: jobsTable.agreedPrice,
  status: jobsTable.status,
  dueDate: jobsTable.dueDate,
  deliveredAt: jobsTable.deliveredAt,
  createdAt: jobsTable.createdAt,
};

export type Job = typeof jobsTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;

export interface RecordedPayment {
  payment: Payment;
  replayed: boolean;
}

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const confirmSameIntent = (
  existing: Payment,
  jobId: string,
  paymentData: CreatePaymentDto,
): RecordedPayment => {
  const sameIntent =
    existing.jobId === jobId &&
    existing.amount === paymentData.amount &&
    dateOnly(existing.paidAt) === dateOnly(paymentData.paidAt);

  if (!sameIntent) {
    throw new ApiError(
      409,
      "Idempotency-Key was already used for a different payment",
    );
  }

  return { payment: existing, replayed: true };
};

export type JobPhoto = Job["styleRef"][number];

export interface JobSummary {
  id: string;
  subjectId: string;
  subjectName: string;
  measurementId: string;
  coverUrl: string | null;
  photoCount: number;
  description: string;
  agreedPrice: number;
  status: Job["status"];
  dueDate: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

export interface JobPayment {
  id: string;
  amount: number;
  paidAt: Date;
}

export interface JobCounts {
  all: number;
  pending: number;
  ready: number;
  delivered: number;
  overdue: number;
}

export interface JobDetail {
  id: string;
  customerId: string;
  customerPhone: string | null;
  subjectId: string;
  subjectName: string;
  measurementsId: string;
  measurements: unknown;
  styleRef: JobPhoto[];
  finishedJob: JobPhoto[];
  description: string;
  agreedPrice: number;
  status: Job["status"];
  dueDate: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  payments: JobPayment[];
}

type PersistedJobData = Omit<JobDataDto, "styleRef" | "finishedJob"> & {
  styleRef: ResolvedPhoto[];
  finishedJob: ResolvedPhoto[];
};

type PersistedUpdateData = Omit<UpdateJobDto, "styleRef" | "finishedJob"> & {
  styleRef?: ResolvedPhoto[];
  finishedJob?: ResolvedPhoto[];
};

@Injectable()
export class JobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly cloudinary: CloudinaryService,
    private readonly photoCleanup: PhotoCleanupService,
  ) {}

  async list({
    cursor,
    limit,
    status,
  }: ListJobsQuery): Promise<Page<JobSummary>> {
    const rows = await this.db
      .select(jobListSelect)
      .from(jobsTable)
      .innerJoin(subjectsTable, eq(jobsTable.subjectId, subjectsTable.id))
      .where(
        and(
          jobStatusFilterCondition(status),
          cursor
            ? keysetCondition(jobsTable.createdAt, jobsTable.id, cursor)
            : undefined,
        ),
      )
      .orderBy(desc(jobsTable.createdAt), desc(jobsTable.id))
      .limit(limit + 1);

    const { items, hasMore, last } = pageRows(rows, limit);

    return {
      items,
      nextCursor:
        hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    };
  }

  async counts(): Promise<JobCounts> {
    const [row] = await this.db
      .select({
        all: count(),
        pending: count(
          sql`case when ${jobsTable.status} = 'pending' then 1 end`,
        ),
        ready: count(
          sql`case when ${jobsTable.status} = 'completed' and ${jobsTable.deliveredAt} is null then 1 end`,
        ),
        delivered: count(
          sql`case when ${jobsTable.status} = 'completed' and ${jobsTable.deliveredAt} is not null then 1 end`,
        ),
        overdue: count(
          sql`case when ${jobsTable.status} = 'pending' and ${jobsTable.dueDate} is not null and ${jobsTable.dueDate} < current_date then 1 end`,
        ),
      })
      .from(jobsTable);

    return {
      all: Number(row?.all ?? 0),
      pending: Number(row?.pending ?? 0),
      ready: Number(row?.ready ?? 0),
      delivered: Number(row?.delivered ?? 0),
      overdue: Number(row?.overdue ?? 0),
    };
  }

  async listForCustomer(
    customerId: string,
    { cursor, limit, status }: ListJobsQuery,
  ): Promise<Page<JobSummary>> {
    const rows = await this.db
      .select(jobListSelect)
      .from(jobsTable)
      .innerJoin(subjectsTable, eq(jobsTable.subjectId, subjectsTable.id))
      .where(
        and(
          eq(jobsTable.customerId, customerId),
          jobStatusFilterCondition(status),
          cursor
            ? keysetCondition(jobsTable.createdAt, jobsTable.id, cursor)
            : undefined,
        ),
      )
      .orderBy(desc(jobsTable.createdAt), desc(jobsTable.id))
      .limit(limit + 1);

    const { items, hasMore, last } = pageRows(rows, limit);

    return {
      items,
      nextCursor:
        hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    };
  }

  async get(id: string): Promise<JobDetail> {
    const [rows, payments] = await Promise.all([
      this.db
        .select({
          id: jobsTable.id,

          // Customer information joined from the customers table.
          customerId: customersTable.id,
          customerPhone: customersTable.phoneNumber,

          // Subject information joined from the subjects table.
          subjectId: subjectsTable.id,

          // If the subject is the customer themselves, use the customer's name;
          // otherwise use the subject's own name.
          subjectName: sql<string>`
          case
            when ${subjectsTable.relationship} = 'self'
            then ${customersTable.name}
            else ${subjectsTable.name}
          end`,

          // Measurement information joined from the measurements table.
          measurementsId: measurementsTable.id,
          measurements: measurementsTable.measurements,

          // Job-specific data.
          styleRef: jobsTable.styleRef,
          finishedJob: jobsTable.finishedJob,
          description: jobsTable.description,
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

      this.db
        .select({
          id: paymentsTable.id,
          amount: paymentsTable.amount,
          paidAt: paymentsTable.paidAt,
        })
        .from(paymentsTable)
        .where(eq(paymentsTable.jobId, id))
        .orderBy(desc(paymentsTable.paidAt)),
    ]);

    const job = rows[0];
    if (!job) throw new ApiError(404, "Job not found");

    return { ...job, payments };
  }

  async createForNewCustomer(input: CreateJobNewCustomerDto): Promise<Job> {
    const { customer: customerData, subjects, job: jobData } = input;

    const subjectData = subjects[0]!;

    const verifiedJob = await this.verifyJobPhotos(jobData);

    return this.db.transaction(async (tx) => {
      const [customer] = await tx
        .insert(customersTable)
        .values({
          name: customerData.name,
          phoneNumber:
            customerData.phoneNumber !== undefined
              ? customerData.phoneNumber
              : undefined,
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
          ...verifiedJob,
        })
        .returning();

      if (!newJob) throw new ApiError(500, "Failed to create job");

      return newJob;
    });
  }

  async createForSubject(
    subjectId: string,
    input: CreateJobForSubjectDto,
  ): Promise<Job> {
    const { measurementId, job: jobData } = input;
    const verifiedJob = await this.verifyJobPhotos(jobData);

    return this.db.transaction(async (tx) => {
      const [subject] = await tx
        .select({ id: subjectsTable.id, customerId: subjectsTable.customerId })
        .from(subjectsTable)
        .where(eq(subjectsTable.id, subjectId))
        .for("share");

      if (!subject) throw new ApiError(404, "Subject not found");

      const [measurement] = await tx
        .select({ id: measurementsTable.id })
        .from(measurementsTable)
        .where(
          and(
            eq(measurementsTable.id, measurementId),
            eq(measurementsTable.subjectId, subjectId),
          ),
        )
        .for("share");

      if (!measurement) {
        throw new ApiError(404, "Measurement not found for this subject");
      }

      const [newJob] = await tx
        .insert(jobsTable)
        .values({
          customerId: subject.customerId,
          subjectId: subject.id,
          measurementId: measurement.id,
          ...verifiedJob,
        })
        .returning();

      if (!newJob) throw new ApiError(500, "Failed to create job");

      return newJob;
    });
  }

  async update(id: string, input: UpdateJobDto): Promise<Job> {
    const { styleRef, finishedJob, ...scalars } = input;

    const next = {
      styleRef: styleRef?.length ? styleRef : undefined,
      finishedJob: finishedJob?.length ? finishedJob : undefined,
    };

    if (!next.styleRef && !next.finishedJob) {
      return this.write(id, scalars);
    }

    const current = await this.get(id);

    const [resolvedStyleRef, resolvedFinishedJob] = await Promise.all([
      next.styleRef
        ? this.cloudinary.verifyAndResolve(next.styleRef)
        : undefined,
      next.finishedJob
        ? this.cloudinary.verifyAndResolve(next.finishedJob)
        : undefined,
    ]);

    const job = await this.write(id, {
      ...scalars,
      ...(resolvedStyleRef && { styleRef: resolvedStyleRef }),
      ...(resolvedFinishedJob && { finishedJob: resolvedFinishedJob }),
    });

    const removed: string[] = [];

    for (const [incoming, previous] of [
      [next.styleRef, current.styleRef],
      [next.finishedJob, current.finishedJob],
    ] as const) {
      if (!incoming) continue;
      const kept = new Set(incoming.map((photo) => photo.publicId));

      for (const photo of previous ?? []) {
        if (photo.publicId && !kept.has(photo.publicId)) {
          removed.push(photo.publicId);
        }
      }
    }

    await this.photoCleanup.enqueueDestroy(removed);

    return job;
  }

  async delete(id: string): Promise<Job> {
    const current = await this.get(id);

    const job = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: jobsTable.id })
        .from(jobsTable)
        .where(eq(jobsTable.id, id))
        .for("update");

      if (!existing) throw new ApiError(404, "Job not found");

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

    const publicIds = [
      ...(current.styleRef ?? []),
      ...(current.finishedJob ?? []),
    ].flatMap((photo) => (photo.publicId ? [photo.publicId] : []));

    await this.photoCleanup.enqueueDestroy(publicIds);

    return job;
  }

  async createPayment(
    jobId: string,
    paymentData: CreatePaymentDto,
    idempotencyKey: string,
  ): Promise<RecordedPayment> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing) return confirmSameIntent(existing, jobId, paymentData);

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
          idempotencyKey,
        })
        .onConflictDoNothing({ target: paymentsTable.idempotencyKey })
        .returning();

      if (newPayment) return { payment: newPayment, replayed: false };

      const [winner] = await tx
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.idempotencyKey, idempotencyKey))
        .limit(1);

      if (!winner) throw new ApiError(500, "Failed to create payment");

      return confirmSameIntent(winner, jobId, paymentData);
    });
  }

  private async write(id: string, jobData: PersistedUpdateData): Promise<Job> {
    if (Object.keys(jobData).length === 0) {
      throw new ApiError(400, "No fields to update");
    }

    const [job] = await this.db
      .update(jobsTable)
      .set(jobData)
      .where(eq(jobsTable.id, id))
      .returning();

    if (!job) throw new ApiError(404, "Job not found");

    return job;
  }

  private async verifyJobPhotos(job: JobDataDto): Promise<PersistedJobData> {
    const { styleRef, finishedJob, ...rest } = job;

    const resolvedStyleRef = await this.cloudinary.verifyAndResolve(styleRef);
    const resolvedFinishedJob =
      await this.cloudinary.verifyAndResolve(finishedJob);

    return {
      ...rest,
      styleRef: resolvedStyleRef,
      finishedJob: resolvedFinishedJob,
    };
  }
}
