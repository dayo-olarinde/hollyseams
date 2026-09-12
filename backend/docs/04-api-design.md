# API Design — Tailor App (v1)

**Source of truth:** `backend/src/routes/*.ts` and the zod schemas in
`backend/src/validations/`. Everything below is mounted under **`/api/v1`** except
`GET /health`, which sits at the root.

## Conventions

- **Envelope.** Every response is `{ success, statusCode, message, data?, meta? }`.
  Errors are `{ success: false, statusCode, message, errors? }`, where `errors` is the
  zod issue list (`[{ field, message }]`) on a validation failure.
- **Auth.** Every route requires a valid session cookie **except** `POST /login` and
  `GET /health`. Sessions are opaque ids in Redis with a TTL, sent as an httpOnly cookie;
  `requireAuth` re-validates the stored payload on every request.
- **Validation.** Every route that accepts input validates it at the boundary — body
  (`validateInput`), path params (`validateParams`) and query (`validateQuery`) — with the
  same zod schema that types the service. Unknown body keys are stripped, not merged.
- **Rate limits.** A global fixed-window limiter on `/api` plus a stricter one on
  `POST /login`. `GET /health` sits outside the `/api` limiter on purpose, so a health poll
  can never be throttled into a false 429.
- **Lists** take `?limit` (default 10) and `?cursor` (opaque, from the previous page's
  `meta.nextCursor`) and return `meta: { nextCursor, totalCount?, totalBalanceDue? }`.
  Cursors are keyset, not offset.

## Auth — `/api/v1/auth`

| Method | Path | Chain | Notes |
|---|---|---|---|
| POST | `/login` | loginLimiter → validateInput → handler | Verifies the PIN, creates the Redis session, sets the httpOnly cookie |
| POST | `/logout` | requireAuth → handler | Deletes the Redis session, clears the cookie |

No `POST /users`: the single user row is seeded, never created through the API (ADR-006).

## Jobs — `/api/v1/jobs`

| Method | Path | Chain | Notes |
|---|---|---|---|
| GET | `/` | requireAuth → validateQuery | List, filterable by `?status=pending\|completed\|delivered` |
| GET | `/signature` | requireAuth | Short-lived Cloudinary upload signature (ADR-004a) |
| GET | `/:id` | requireAuth → validateParams | One job, with the full photo arrays |
| POST | `/new-customer` | requireAuth → validateInput | **Creates a job for a brand-new client** — customer, subject, measurement and job in one transaction |
| POST | `/:id` | requireAuth → validateParams → validateInput | Creates a job for an **existing subject** (`:id` is the subject id) |
| PATCH | `/:id` | requireAuth → validateParams → validateInput | Updates a job, including setting `deliveredAt` |
| DELETE | `/:id` | requireAuth → validateParams | Deletes a job (and destroys its Cloudinary assets best-effort) |
| POST | `/:jobId/payments` | requireAuth → validateParams → validateInput | Records a payment against a job |

> There is no bare `POST /jobs`. The original sketch assumed one endpoint taking
> `customerId` + `subjectId`, but the app's two real entry points are "new client" (nothing
> exists yet, so customer/subject/measurement are created with the job) and "existing
> subject" (everything but the job already exists). Those validate and transact differently,
> so they are two endpoints rather than one with a branching body.

## Customers — `/api/v1/customers`

| Method | Path | Chain | Notes |
|---|---|---|---|
| GET | `/` | requireAuth → validateQuery | List, A→Z, cursor-paginated |
| POST | `/` | requireAuth → validateInput | Create a customer |
| GET | `/:id` | requireAuth → validateParams | One customer |
| PATCH | `/:id` | requireAuth → validateParams → validateInput | Update a customer |
| GET | `/:id/subjects` | requireAuth → validateParams → validateQuery | This customer's subjects |
| POST | `/:id/subjects` | requireAuth → validateParams → validateInput | Add a subject under a customer |
| GET | `/:id/jobs` | requireAuth → validateParams → validateQuery | This customer's jobs |

No delete endpoint — customers cannot be deleted (ADR-007).

## Subjects — `/api/v1/subjects`

| Method | Path | Chain | Notes |
|---|---|---|---|
| GET | `/:id` | requireAuth → validateParams | One subject |
| GET | `/:id/measurements` | requireAuth → validateParams → validateQuery | Measurement history, newest first |
| POST | `/:id/measurements` | requireAuth → validateParams → validateInput | Record a new measurement snapshot |

Measurements are append-only: a new fitting is a new row, never an update of an old one
(ADR-003). Jobs reference the row they were cut from.

## Reports — `/api/v1/reports`

Computed views, not raw CRUD.

| Method | Path | Chain | Notes |
|---|---|---|---|
| GET | `/monthly-revenue` | requireAuth | Revenue per month, newest first — the client picks the month it shows |
| GET | `/top-customers` | requireAuth → validateQuery | Ranked by total paid (`?limit`) |
| GET | `/outstanding-payments` | requireAuth | Jobs where payments total less than the agreed price |

## Health — root

| Method | Path | Chain | Notes |
|---|---|---|---|
| GET | `/health` | — | `200 { checks: { database, redis } }`, or `503` with `"degraded"` when either ping fails |

## Notes

- Payments, subjects and measurements are nested under their parent resource, since none of
  them is meaningful without one.
- The frontend calls these through `/api/*`, which `frontend/next.config.ts` rewrites to the
  API server, so the browser only ever talks to its own origin.
