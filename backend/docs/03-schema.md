# Schema Design — Tailor App (v1)

**Source of truth:** `backend/src/db/schema/*.ts`. This document mirrors that code. If the
two ever disagree, the code wins and this file is out of date — check it whenever a
migration lands.

Conventions:

- Every timestamp is `timestamptz`.
- Money is `numeric(12, 2)` (Drizzle `mode: "number"`), i.e. up to 9,999,999,999.99. The
  original sketch said `numeric(6,2)`; that caps a single price or payment at 9,999.99,
  which is too tight for a tailor pricing several garments in one job, so it was widened.
- `onDelete` is spelled out per foreign key, because the choice is what protects history
  (see ADR-007).

## Users (`user`)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| firstName | text | not null — used for the greeting ("Morning, Wunmi") |
| pinHash | text | not null — Argon2id hash of `"<pin>:<PEPPER>"`, never plaintext |
| createdAt | timestamptz | |

One row, seeded manually. No endpoint creates it (see ADR-006). The table is named `user`
(singular) because exactly one row ever exists. There is no `updatedAt`: the PIN is
re-seeded, not updated through the app.

## Customers (`customers`)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | not null |
| phoneNumber | text | optional (contact info) |
| createdAt / updatedAt | timestamptz | not null |

The account holder / payer. Appears in revenue and top-customer reports. Cannot be deleted
through the API (ADR-007) — and `jobs.customer_id` is `restrict`, so a customer with any job
history cannot be deleted in the database either.

**Indexes:** `customers_name_id_idx` on `(name, id)` — the A→Z list ordering (migration 0008).

## Subjects (`subjects`)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| customerId | uuid | FK → customers, `onDelete: cascade`, not null |
| name | text | not null |
| relationship | varchar | optional ("self", "daughter", "mother", …) |
| createdAt / updatedAt | timestamptz | not null |

Represents who a garment is actually for, separate from who pays. A customer can have
several subjects (including a "self" subject), so measurement and job history stays correct
per person even when one customer pays for several family members (see ADR-008).

**Indexes:** `subjects_customer_id_idx` on `(customerId)`;
`subjects_customer_created_at_id_idx` on `(customerId, createdAt DESC, id DESC)` — keyset
pagination for "this customer's subjects".

## Measurements (`measurements`)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| subjectId | uuid | FK → subjects, `onDelete: cascade`, not null |
| measurements | jsonb | not null — `{ [fieldKey]: number \| null }` |
| date | date | not null — when the fitting was taken |
| createdAt / updatedAt | timestamptz | not null |

Its own table rather than columns on Subjects so history is never overwritten (ADR-003), and
jsonb rather than fixed columns because the fields needed differ per garment (ADR-008). Field
keys are camelCase (`"Sleeve length"` → `sleeveLength`), produced client-side by the modal.

**Indexes:** `measurements_subject_id_idx` on `(subjectId)`;
`measurements_subject_date_id_idx` on `(subjectId, date DESC, id DESC)` — "this subject's
fittings, newest first", which is exactly how the app reads them.

## Jobs (`jobs`)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| customerId | uuid | FK → customers, `onDelete: restrict`, not null — who pays |
| subjectId | uuid | FK → subjects, `onDelete: restrict`, not null — who it's for |
| measurementId | uuid | FK → measurements, `onDelete: restrict`, not null — the fitting this job was cut from |
| styleRef | jsonb | not null — `{url, publicId?, alt}[]` style-reference photos |
| finishedJob | jsonb | not null — `{url, publicId?, alt}[]` finished-job photos |
| description | text | not null, default `""` — short garment brief |
| agreedPrice | numeric(12,2) | not null |
| status | `job_status` enum | not null — `pending` / `completed` / `canceled` |
| dueDate | date | optional |
| deliveredAt | timestamptz | optional — distinct from `status` |
| createdAt / updatedAt | timestamptz | not null |

One job = one unit of work (one garment), not one payment or one visit (ADR-005).

Photos are `{url, publicId?, alt}[]`: `url` is always server-derived (the backend resolves
each `public_id` against Cloudinary before persisting), so a client cannot write an arbitrary
URL into the database (ADR-004a). `publicId` is optional for legacy rows only; new rows
always carry it so assets can be destroyed when a photo or job is removed.

**Indexes:** `jobs_customer_id_idx`, `jobs_status_idx`, `jobs_due_date_idx`, and
`jobs_created_at_id_idx` on `(createdAt DESC, id DESC)` — the keyset cursor for
newest-first lists.

## Payments (`payments`)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| jobId | uuid | FK → jobs, `onDelete: restrict`, not null |
| amount | numeric(12,2) | not null |
| paidAt | date | not null — when the money arrived |
| createdAt / updatedAt | timestamptz | not null |

One-to-many with Jobs — deliberately its own table with no denormalized `customerId`
(ADR-002), so a job can be paid in parts (deposit, balance, installments).

**Indexes:** `payments_job_id_created_at_idx` on `(jobId, paidAt)` — per-job payment
totals and the balance join.

> There was also an expression index on `date_trunc('month', paid_at)` declared in the
> schema at one point. It was never in a migration or a snapshot, and the monthly-revenue
> query aggregates over a whole month range anyway, so it was removed rather than kept as a
> declaration that didn't exist in the database.

## Derived values (not columns)

Three things the app reports are computed, never stored — storing them would mean keeping two
copies of the same fact in sync:

| Value | Derivation |
|---|---|
| `delivered` | `status = 'completed' AND delivered_at IS NOT NULL` |
| `ready` (completed, not yet delivered) | `status = 'completed' AND delivered_at IS NULL` |
| balance due | `agreed_price − SUM(payments.amount)` for the job |
