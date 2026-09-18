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

      // If finishedJob contains at least one item...
      when jsonb_array_length(${jobsTable.finishedJob}) > 0

        // ...take the first item's "url".
        // nullif(..., '') turns an empty string into SQL NULL.
        then nullif(${jobsTable.finishedJob}[0] ->> 'url', '')

      // Otherwise, if styleRef contains at least one item...
      when jsonb_array_length(${jobsTable.styleRef}) > 0

        // ...use the first style reference item's "url".
        then nullif(${jobsTable.styleRef}[0] ->> 'url', '')

      // Neither array has an image.
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

/**
 * The answer to "record this payment" — and whether it was recorded *now* or replayed.
 *
 * `replayed: true` means the client had already performed this intent and got its response
 * lost, so nothing was written this time; the controller tells it so with
 * `Idempotent-Replay: true` while returning the original payment. Callers that do not care can
 * ignore the flag — it exists so the behaviour is visible rather than silent.
 */
export interface RecordedPayment {
  payment: Payment;
  replayed: boolean;
}

/**
 * The calendar day a `date` column actually holds.
 *
 * `paid_at` is a DATE, and Drizzle persists a JS `Date` through `toISOString()`: Postgres keeps
 * the date part of that string (`2026-02-01T12:00:00.000Z` → `2026-02-01`) and Drizzle reads it
 * back as `2026-02-01T00:00:00.000Z`. Comparing raw timestamps would therefore judge a retry of
 * the same noon payment to be a *different* intent at midnight — so the retry comparison uses
 * the same calendar day the database stored. (`frontend/` sends local noon precisely so the
 * tailor's day survives the UTC conversion.)
 */
const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * [7/12] and [10/12] — decide what a duplicate delivery of a key means.
 *
 * A key is a promise about the request that carries it: same key ⇒ same intent ⇒ same job,
 * amount and day. So there are exactly two outcomes for a recorded payment:
 *
 * - It matches this request → the intent already succeeded; return the stored row as a replay
 *   and write nothing. The client sees the identical 201 body it would have seen the first
 *   time (the response-body question answers itself here: the payment *is* the response).
 * - It does not match → a client reused a key for different money. That is a bug, not a retry:
 *   409, because silently returning the old payment would report success for an amount that
 *   was never recorded.
 *
 * The comparison includes `paidAt` as a calendar day, not as a timestamp — see `dateOnly` for
 * why, and note the one edge it accepts: a client that omits `paidAt` lets the schema default it
 * to "today" (`new Date()`), so a retry across midnight is a different intent by this rule and
 * gets a 409 instead of a replay. The payment sheet always sends the date explicitly, so this
 * only bites a hand-rolled client.
 */
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

// Job["styleRef"][number]: Type of ONE element inside styleRef
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

/** One number per status tab on the jobs screen, plus the overdue alert. */
export interface JobCounts {
  all: number;
  pending: number;
  ready: number;
  delivered: number;
  /** Still open and past its due date — the jobs screen's red banner, counted exactly. */
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

  /**
   * Record a payment exactly once per client intent.
   *
   * ── The problem this solves ────────────────────────────────────────────────────────────────
   *
   * `POST /jobs/:jobId/payments` is not safe to deliver twice, but "delivered exactly once" is
   * not something the network or the UI can promise:
   *
   * - The tailor double-taps Pay. The button is disabled while the mutation is pending, but a
   *   tap can land in the gap before React re-renders, and a second device has its own UI state
   *   entirely.
   * - The request reaches the server, the payment **commits**, and the *response* is lost — a
   *   dropped connection, the client's 15 s timeout, a reload. The client's honest view is
   *   "unknown", so it retries. Without a key, that retry is a second payment, and the balance
   *   and every report built on it are now wrong.
   * - A proxy, or a future queue, redelivers the request on its own schedule.
   *
   * The `FOR UPDATE` on the job row serialises concurrent attempts but does **not** deduplicate
   * them: the second attempt waits for the lock, then inserts its own payment. The client's key
   * is what tells the server "these two requests are one intent" — and the unique index on
   * `payments.idempotency_key` is what enforces it.
   *
   * ── The algorithm (steps [7/12]–[10/12]; [1/12]–[4/12] are the frontend, [5/12] validates the
   *    header, [6/12] calls this method, [11/12] serialises the answer) ──────────────────────
   *
   * [7/12]  Has this key already recorded a payment? A read-only fast path: a replay of an
   *         committed intent returns the stored row without touching a lock, and a key reused
   *         for different money is refused here.
   * [8/12]  Otherwise lock the job row `FOR UPDATE` — the lock that predates idempotency and is
   *         still needed: it is what makes `delete`'s "no payments" check wait for this insert
   *         (§19.2), and it must not be conflated with the deduplication above.
   * [9/12]  Insert the payment **with its key**, `ON CONFLICT DO NOTHING`. This is the
   *         arbitration: of two concurrent deliveries, exactly one insert commits. [7] is an
   *         optimisation, never the decision — a check-then-insert without the unique index is
   *         a race, and the race is the thing the key exists to close.
   * [10/12] Zero rows means another delivery won between [7] and [9]. Postgres makes this read
   *         safe: `ON CONFLICT ... DO NOTHING` waits for the conflicting transaction to finish,
   *         and the next statement sees the committed row, so the winner is always readable.
   *
   * ── A retry after a lost response, as a timeline ──────────────────────────────────────────
   *
   *   tap #1 → [7] no row → [8] lock job → [9] INSERT (key K) ✅ → COMMIT → response lost ✗
   *   tap #2 → [7] finds key K → same job/amount/day → return the SAME row, write nothing
   *            → 201 + `Idempotent-Replay: true`
   *
   * ── Two deliveries at once (double-tap, two devices) ──────────────────────────────────────
   *
   *   A: [7] no row → [8] lock job ✅ → [9] INSERT ✅ → COMMIT ─┐
   *   B: [7] no row → [8] waits for A's lock →        [9] INSERT conflicts
   *      → [10] reads A's committed row → replay  ← both clients see ONE payment
   *
   * ── The rules that are easy to get wrong ──────────────────────────────────────────────────
   *
   * - **Key and effect share this transaction.** If the insert fails (say the job was deleted
   *   mid-flight), the key rolls back with it, so the retry runs fresh. A key committed on its
   *   own would leave a phantom "already done" for money that was never recorded.
   * - **A retry may not change the request.** Same key with a different amount/job/day is a
   *   client bug, not a retry → 409 (`confirmSameIntent`), rather than a success response for
   *   money that was never recorded.
   * - **Nothing expires.** The key lives exactly as long as its payment, so a retry days later
   *   still replays the original. A generic `idempotency_keys` table — the Stripe shape, with a
   *   request hash, stored response and a 24 h TTL — earns its extra moving parts when a second
   *   endpoint needs idempotency; see `hollyseams-scalability-and-multi-tenancy.md` §8.7.
   */
  async createPayment(
    jobId: string,
    paymentData: CreatePaymentDto,
    idempotencyKey: string,
  ): Promise<RecordedPayment> {
    return this.db.transaction(async (tx) => {
      // [7/12] Fast path: has this intent already been recorded? A plain read — no lock — so a
      // replay never queues behind other writers, and a key reused for a different payment is
      // refused before anything is written.
      const [existing] = await tx
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing) return confirmSameIntent(existing, jobId, paymentData);

      // [8/12] The invariant that predates this change: the read that decides whether the job
      // may be written takes the row lock, so a concurrent `delete` waits (§19.2).
      const [job] = await tx
        .select({ id: jobsTable.id })
        .from(jobsTable)
        .where(eq(jobsTable.id, jobId))
        .for("update");

      if (!job) throw new ApiError(404, "Job not found");

      // [9/12] The claim. The key is part of the row that is the effect, so the unique index
      // arbitrates and a rolled-back insert takes its key with it. `DO NOTHING` (not a 409 for
      // the loser): losing means somebody else already recorded this intent, and the next step
      // answers with their row.
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

      // [10/12] Concurrent duplicate: re-read the winner and replay it (or 409 if the same key
      // was pointed at different money).
      const [winner] = await tx
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.idempotencyKey, idempotencyKey))
        .limit(1);

      // Unreachable on Postgres: the conflicting transaction has committed by the time the
      // insert returns zero rows, so its row is visible to this statement. A 500 (not a silent
      // retry) if reality ever disagrees with that.
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
