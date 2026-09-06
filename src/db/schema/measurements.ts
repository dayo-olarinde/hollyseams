import { date, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { subjectsTable } from "./subjects";

export const measurementsTable = pgTable("measurements", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .references(() => subjectsTable.id, {
      onDelete: "cascade",
    })
    .notNull(),
  measurements: jsonb("measurements").notNull(),
  date: date("date", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
});
