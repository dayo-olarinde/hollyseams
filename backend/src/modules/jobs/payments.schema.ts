import { z } from "zod";

export const createPaymentSchema = z.strictObject({
  amount: z.coerce
    .number()
    .finite("Payment amount must be a finite number")
    .positive("Payment amount must be greater than zero")
    .max(9999999999.99, "Payment amount must be at most 9999999999.99"),
  paidAt: z.coerce.date().default(() => new Date()),
});

export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;

/**
 * The `Idempotency-Key` request header — required to record a payment.
 *
 * ── What a key is, in one sentence ───────────────────────────────────────────────────────────
 *
 * An opaque value the CLIENT generates once per *intent* ("record ₦5,000 for Ada's gown today")
 * and sends with every delivery of that intent, so the server can recognise a duplicate request
 * as a duplicate instead of as a second payment.
 *
 * ── Why the header is required (and why it is a UUID) ────────────────────────────────────────
 *
 * - **Required, not optional.** An optional key protects only the clients that remembered to
 *   send one; the endpoint's guarantee would hold for well-behaved clients and silently fail
 *   for the rest. This is a breaking API change on purpose — and the cheapest moment to make it
 *   is now, while the only client is in this repo.
 * - **Validated as a UUID at the trust boundary.** The value becomes a database value, so an
 *   unvalidated header means a client could store a 1 MB "key" per request — a cheap way to
 *   fill a table. A UUID is fixed-size, unguessable, needs no coordination between clients, and
 *   is what browsers hand out for free: `crypto.randomUUID()` (see the payment sheet in
 *   `frontend/src/app/jobs/[id]/page.tsx`, step [1/12]).
 *
 * ── Where this fits in the 12-step flow ──────────────────────────────────────────────────────
 *
 * [1/12] payment sheet opens → `crypto.randomUUID()` (one intent = one key)
 * [2/12] tap → the key travels with the mutation
 * [3/12] `useCreatePayment` → API client
 * [4/12] `Idempotency-Key: 9f8fad5b-…` goes out on the request
 * [5/12] **this schema** — the header is parsed/validated here, before any service runs
 * [6/12] controller → `JobsService.createPayment`
 * [7/12] service: has this key already been recorded?
 * [8/12] service: lock the job row (the existing delete-vs-payment serialization)
 * [9/12] service: insert the payment WITH the key, `ON CONFLICT DO NOTHING`
 * [10/12] service: insert conflicted → read the winner → replay it
 * [11/12] controller: `201` + the original payment body (+ `Idempotent-Replay: true`)
 * [12/12] frontend: reconcile the cache with the server's answer
 *
 * ── Example errors this produces ─────────────────────────────────────────────────────────────
 *
 * - no header → 400 `{ message: "Invalid Idempotency-Key header",
 *                      errors: [{ field: "Idempotency-Key",
 *                                 message: "Idempotency-Key header is required" }] }`
 * - `Idempotency-Key: abcd` → 400 with `"must be a UUID"`.
 *
 * The two messages differ on purpose: "you forgot it" and "you sent nonsense" are different
 * bugs on the client, and one message for both would hide which one happened.
 */
export const idempotencyKeySchema = z.uuid({
  error: (issue) =>
    issue.input === undefined
      ? "Idempotency-Key header is required"
      : "Idempotency-Key header must be a UUID",
});

export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;
