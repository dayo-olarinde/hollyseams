import {
  date,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";

export const paymentsTable = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .references(() => jobsTable.id, {
        onDelete: "restrict",
      })
      .notNull(),
    amount: numeric("amount", {
      precision: 6,
      scale: 2,
      mode: "number",
    }).notNull(),
    paidAt: date("paid_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => [index("payments_job_id_created_at_idx").on(t.jobId, t.paidAt)],
);
