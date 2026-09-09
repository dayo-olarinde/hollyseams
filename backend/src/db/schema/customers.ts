import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const customersTable = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phoneNumber: text("phone_number"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
});
