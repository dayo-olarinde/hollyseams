import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import { ApiError } from "../../common/http/api-response";
import {
  keysetCondition,
  pageRows,
  type Page,
} from "../../common/pagination/cursor";
import type { ListQuery } from "../../common/validation/list-query.schema";
import {
  customersTable,
  measurementsTable,
  subjectsTable,
} from "../../database";
import { DRIZZLE, type Database } from "../../database/database.module";
import type { CreateMeasurementDto, CreateSubjectDto } from "./subjects.schema";

export type Subject = typeof subjectsTable.$inferSelect;
export type Measurement = typeof measurementsTable.$inferSelect;

export interface SubjectSummary {
  id: string;
  name: string;
  relationship: string | null;
  createdAt: Date;
}

export interface SubjectDetail {
  id: string;
  customerId: string;
  name: string;
  relationship: string | null;
}

/** The measurement history projection. */
export interface MeasurementSummary {
  id: string;
  subjectId: string;
  measurements: unknown;
  date: Date;
}

@Injectable()
export class SubjectsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(
    customerId: string,
    { cursor, limit }: ListQuery,
  ): Promise<Page<SubjectSummary>> {
    const rows = await this.db
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

    const { items, hasMore, last } = pageRows(rows, limit);

    return {
      items,
      nextCursor:
        hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    };
  }

  async create(
    customerId: string,
    subjectData: CreateSubjectDto,
  ): Promise<Subject> {
    const { relationship } = subjectData;
    return this.db.transaction(async (tx) => {
      const [customer] = await tx
        .select({ name: customersTable.name })
        .from(customersTable)
        .where(eq(customersTable.id, customerId))
        .for("share");

      if (!customer) throw new ApiError(404, "Customer not found");

      const name = relationship === "self" ? customer.name : subjectData.name!;

      const [subject] = await tx
        .insert(subjectsTable)
        .values({
          customerId,
          name,
          ...(relationship !== undefined && { relationship }),
        })
        .returning();

      if (!subject) throw new ApiError(500, "Failed to create subject");

      return subject;
    });
  }

  async get(id: string): Promise<SubjectDetail> {
    const [subject] = await this.db
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
  }

  async createMeasurement(
    subjectId: string,
    measurementData: CreateMeasurementDto,
  ): Promise<Measurement> {
    const { measurements, date } = measurementData;

    const [newMeasurement] = await this.db
      .insert(measurementsTable)
      .values({
        subjectId,
        measurements,
        date,
      })
      .returning();

    if (!newMeasurement) {
      throw new ApiError(500, "Failed to create measurements");
    }

    return newMeasurement;
  }

  async listMeasurements(
    subjectId: string,
    { cursor, limit }: ListQuery,
  ): Promise<Page<MeasurementSummary>> {
    const rows = await this.db
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

    const { items, hasMore, last } = pageRows(rows, limit);

    const toCursorDate = (value: unknown): string => {
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      return String(value);
    };

    return {
      items,
      nextCursor:
        hasMore && last ? `${toCursorDate(last.date)}|${last.id}` : null,
    };
  }
}
