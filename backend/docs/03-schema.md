# Schema Design — Tailor App (v1)

## Users
| Field | Notes |
|---|---|
| id | PK |
| name | for "Welcome, [name]" on the homepage |
| pinHash | Argon2 hash (with pepper), never plaintext |
| createdAt | |

Single row, seeded manually — not created via a public endpoint (see ADR-006).

## Customers
| Field | Notes |
|---|---|
| id | PK |
| name | |
| phoneNumber | optional |
| createdAt / updatedAt | |

The account holder / payer. Appears in revenue and top-customer reports. Cannot be deleted (see ADR-007).

## Subjects
| Field | Notes |
|---|---|
| id | PK |
| customerId | FK → Customers, `onDelete: restrict`, **not null** |
| name | |
| relationship | optional (e.g. "self", "daughter", "mother") |
| createdAt / updatedAt | |

Represents who a garment is actually for, separate from who pays. A customer can have multiple subjects (including a "self" subject), so measurement and job history stays correct per person even when one customer pays for several family members (see ADR-008).

## Measurements
| Field | Notes |
|---|---|
| id | PK |
| subjectId | FK → Subjects, `onDelete: restrict`, **not null** |
| measurements | jsonb — shape varies by garment type, so no fixed columns |
| date | when taken |
| createdAt / updatedAt | |

Kept as its own table (not columns on Subjects/Customers) so history is never overwritten (see ADR-003). jsonb chosen over rigid columns since required fields differ per garment (see ADR-008).

## Jobs
| Field | Notes |
|---|---|
| id | PK |
| customerId | FK → Customers, `onDelete: restrict`, **not null** — who's paying |
| subjectId | FK → Subjects, `onDelete: restrict`, **not null** — who it's for |
| measurementId | FK → Measurements, `onDelete: restrict`, **not null** — a job creates or reuses a measurement snapshot rather than storing its own fields |
| styleRef | jsonb array of `{url, alt}` — multiple style-reference photos |
| finishedJob | jsonb array of `{url, alt}` — multiple finished-job photos |
| agreedPrice | numeric(6,2) |
| status | enum: pending / completed / canceled |
| dueDate | |
| deliveredAt | timestamp — distinct from `status`; a job can be completed but not yet delivered (often due to unpaid balance) |
| createdAt / updatedAt | |

One job = one unit of work (one garment), not one payment or one customer visit (see ADR-005).

**Indexes:** `customerId`, `status`.

## Payments
| Field | Notes |
|---|---|
| id | PK |
| jobId | FK → Jobs, `onDelete: restrict`, **not null** |
| amount | numeric(6,2) |
| paidAt | date, **not null** |
| createdAt / updatedAt | |

One-to-many with Jobs — deliberately its own table with no denormalized `customerId` (see ADR-002).

**Indexes:** `jobId` + `paidAt` (composite) — supports monthly revenue and outstanding-payment queries, which filter/aggregate by when a payment was actually made, not when the row was created.
