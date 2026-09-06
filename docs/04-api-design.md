# API Design — Tailor App (v1)

## Auth
- `POST /login` — verify PIN, create a Redis-backed session, set an httpOnly cookie. Rate-limited (fixed window).
- `POST /logout` — delete the session from Redis, clear the cookie.
- No `POST /users` — the single user row is seeded manually, not exposed as a route (see ADR-006).

## Jobs
- `GET /jobs` — list jobs
- `POST /jobs` — create a job (customerId, subjectId, measurement info, photos, agreedPrice)
- `GET /jobs/:id` — get a single job
- `PATCH /jobs/:id` — update a job (including setting `deliveredAt`)
- `DELETE /jobs/:id` — delete a job
- `POST /jobs/:jobId/payments` — record a payment against a job

## Customers
- `GET /customers` — list customers
- `POST /customers` — create a customer
- `GET /customers/:id` — get a single customer
- `PATCH /customers/:id` — update a customer
- No delete endpoint — customers cannot be deleted (see ADR-007)

## Subjects
- `GET /customers/:id/subjects` — list a customer's subjects (self, children, etc.)
- `POST /customers/:id/subjects` — add a subject under a customer
- `POST /subjects/:id/measurements` — record a new measurement snapshot for a subject
- `GET /subjects/:id/measurements` — view a subject's measurement history

## Reports (computed views, not raw CRUD)
- `GET /reports/monthly-revenue`
- `GET /reports/top-customers`
- `GET /reports/outstanding-payments`

## Notes
- All routes except `/login` sit behind session-auth middleware.
- Payments, subjects, and measurements are nested under their parent resource since none of them make sense without one.
