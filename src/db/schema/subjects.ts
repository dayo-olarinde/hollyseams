import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

export const subjectsTable = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .references(() => customersTable.id, {
        onDelete: "cascade",
      })
      .notNull(),
    name: text("name").notNull(),
    relationship: varchar("relationship"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => [index("subjects_customer_id_idx").on(t.customerId)],
);
