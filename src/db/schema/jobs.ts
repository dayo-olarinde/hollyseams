import {
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { measurementsTable } from "./measurements";
import { subjectsTable } from "./subjects";

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "completed",
  "canceled",
]);

export const jobsTable = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .references(() => customersTable.id, {
        onDelete: "restrict",
      })
      .notNull(),
    subjectId: uuid("subject_id")
      .references(() => subjectsTable.id, {
        onDelete: "restrict",
      })
      .notNull(),
    measurementId: uuid("measurement_id")
      .references(() => measurementsTable.id, {
        onDelete: "restrict",
      })
      .notNull(),
    styleRef: jsonb("style_ref")
      .$type<{ url: string; alt: string }[]>()
      .notNull(),
    finishedJob: jsonb("finished_job")
      .$type<{ url: string; alt: string }[]>()
      .notNull(),
    agreedPrice: numeric("agreed_price", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    status: jobStatusEnum("status").notNull(),
    dueDate: date("due_date", { mode: "date" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => [
    index("jobs_customer_id_idx").on(t.customerId),
    index("jobs_status_idx").on(t.status),
    index("jobs_due_date_idx").on(t.dueDate),
    index("jobs_created_at_id_idx").on(t.createdAt.desc(), t.id.desc()),
  ],
);
