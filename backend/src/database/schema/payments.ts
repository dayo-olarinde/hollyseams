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
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    paidAt: date("paid_at", { mode: "date" }).notNull(),

    /**
     * The `Idempotency-Key` the client sent when this payment was recorded, or `null` for rows
     * that predate the column (the retired Express app wrote those).
     *
     * This single column is the whole idempotency mechanism, and it is deliberately a property
     * of the *effect* rather than a separate `idempotency_keys` table:
     *
     * - **The unique constraint is the arbiter, never a prior `SELECT`.** Two concurrent
     *   deliveries of one intent both try to insert a row with this key; Postgres lets exactly
     *   one commit, and the loser reads the winner's row back and replays it (see
     *   `JobsService.createPayment`). A "have I seen this key?" check before the insert would
     *   be a race — the check and the write are not atomic, which is the exact bug keys exist
     *   to stop.
     * - **Key and effect are one row, so they commit or roll back together.** If the payment
     *   insert fails (say the job was deleted mid-flight), its key disappears with it and the
     *   client's retry runs fresh — it is never told "already done" for money that was never
     *   recorded.
     * - **Legacy rows are `null`, and Postgres allows many `null`s inside a unique index**, so
     *   rows that predate the column never collide with each other or block new inserts.
     *
     * The unique index is global rather than scoped to the job: a key identifies one request,
     * and one request can only ever create one payment, whatever job it names.
     *
     * ponytail: one endpoint, so the key lives on its effect. When a second endpoint needs
     * idempotency, extract a shared `idempotency_keys` table (key, request hash, stored
     * response, TTL) — `hollyseams-scalability-and-multi-tenancy.md` §8.7.
     */
    idempotencyKey: uuid("idempotency_key").unique(),

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
