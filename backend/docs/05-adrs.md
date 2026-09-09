# Architecture Decision Records — Tailor App

## ADR-001: PIN-based login instead of email/password or OAuth
**Context:** App has exactly one user (my sister). Standard auth patterns assume multiple accounts and add setup/maintenance for problems this app doesn't have.
**Decision:** Use a PIN (Argon2-hashed with a pepper) in a minimal `users` table, with Redis rate limiting on failed attempts.
**Consequences:** Simple to build and use. Threat model is casual access, not a sophisticated attacker — acceptable here. Would need replacing if the app ever became multi-user.

## ADR-002: Payments as their own table, one-to-many with Jobs
**Context:** Jobs are often paid in parts (deposit, balance, installments), so a job can have more than one payment. Initially considered denormalizing `customerId` onto Payments for faster customer-level queries.
**Decision:** Payments live in their own table with `jobId` as a foreign key. No `customerId` on Payments — customer queries join through Jobs.
**Consequences:** Requires a two-table join for customer-level reports, but avoids a stale/denormalized `customerId` and the join cost is negligible at this app's scale.

## ADR-003: Measurements as their own table, linked to a Subject
**Context:** The old notebook system overwrote measurements each time; measurement history needs to be preserved per person, not per paying customer.
**Decision:** Measurements get their own table, keyed by `subjectId` (not `customerId`). Each Job points to one Measurements row via `measurementId`.
**Consequences:** One more table/join, but full measurement history is kept automatically per person, and jobs can reuse an existing measurement if nothing's changed.

## ADR-004: Cloudinary for photo storage
**Context:** Photos need to survive a lost or reset phone, unlike the current setup.
**Decision:** Use Cloudinary, since it's already familiar and handles storage reliably.
**Consequences:** Photos are safe and backed up. Adds a small external dependency and cost, acceptable for the reliability gained.

## ADR-004a: Signed direct uploads, verified by public_id before persisting
**Context:** The browser must upload photos without streaming bytes through Express, but the database must never store a client-supplied URL string.
**Decision:** The backend issues a short-lived signed upload (`GET /jobs/signature`, 15-minute `expires_at`, image-only, fixed `CLOUDINARY_UPLOAD_FOLDER`); the browser uploads straight to Cloudinary; the client then references photos only by the `public_id` Cloudinary returned. Before any create/update persists, the backend resolves each `public_id` via Cloudinary's Admin API and stores the server-derived `secure_url` alongside it (`{url, publicId, alt}`). Assets dropped from a job or released by a job deletion are destroyed afterwards (best-effort, only after the DB write succeeds).
**Consequences:** File bytes never touch the server, forged URLs cannot reach the DB, and removed photos don't accumulate in storage. Cost: one Admin-API lookup per photo per save, and uploads not attached to a job remain orphaned until cleanup — accepted at single-user scale.

## ADR-005: A job represents one unit of work, not one payment or one visit
**Context:** A customer can bring multiple items in one visit (e.g. 5 kids' outfits), each needing separate tracking and pricing.
**Decision:** Each item is its own Job, even if paid for together in one visit.
**Consequences:** More records created per visit, but pricing, payment status, and history stay accurate per item.

## ADR-006: PIN login with Redis-backed sessions and fixed-window rate limiting
**Context:** Only one user will ever log in, so full auth infrastructure (email/password, OAuth, JWT) is more than needed. JWT specifically was considered and rejected because its main benefit — statelessness across distributed servers — solves a problem this app doesn't have, while its main weakness — awkward revocation — is a real cost given Redis is already available for sessions.
**Decision:** PIN checked against an Argon2 hash; a random session ID is issued on login, stored in Redis with the user id and a TTL, and set as an httpOnly cookie. Failed login attempts are rate-limited with a fixed-window counter in Redis.
**Consequences:** Login stays simple, logout/revocation is instant (delete the Redis key), and rate limiting protects against basic abuse without overbuilding for a threat that doesn't exist here.

## ADR-007: Customers cannot be deleted
**Context:** Jobs are linked to customers, and deleting a customer would break job/payment history and reports.
**Decision:** No delete endpoint for customers; the database also blocks it (`onDelete: restrict`).
**Consequences:** Customer records can't be cleaned up later without extra work, but history and reports stay accurate.

## ADR-008: Separate "who pays" (Customer) from "who it's for" (Subject); measurements stored as jsonb
**Context:** A customer sometimes brings work for family members (e.g. herself, her daughters, her mother), not just herself. Measurements and job history need to persist per person even though only the customer pays and appears in revenue reports. Separately, required measurement fields vary by garment type (shirt vs trousers), so a fixed set of columns doesn't fit every row.
**Decision:** Introduce a `subjects` table (id, customerId, name, relationship) representing who a garment is for. `measurements` and `jobs` reference `subjectId`, while `jobs` also keeps `customerId` for billing/reporting. The `measurements` field itself is stored as jsonb rather than fixed columns.
**Consequences:** One more table and an extra foreign key on Jobs, but per-person measurement history is preserved correctly regardless of who's paying, and adding a new measurement type later needs no schema migration.
