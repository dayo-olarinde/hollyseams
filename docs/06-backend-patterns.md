# 06 — Backend Codebase Patterns & Decisions

This document explains **how the backend is written and why** — the patterns,
the decisions behind them, and the mistakes they prevent. It follows the
actual code, so you can read it with the repo open.

Contents:

1. [The request lifecycle](#1-the-request-lifecycle)
2. [What each layer is allowed to do](#2-what-each-layer-is-allowed-to-do)
3. [Validation patterns (zod)](#3-validation-patterns-zod)
4. [Controller patterns](#4-controller-patterns)
5. [Service patterns](#5-service-patterns)
6. [When we drop to raw SQL (reports)](#6-when-we-drop-to-raw-sql-reports)
7. [Errors and responses](#7-errors-and-responses)
8. [Database conventions](#8-database-conventions)
9. [Express 5 notes](#9-express-5-notes)
10. [Real bugs these patterns would have caught](#10-real-bugs-these-patterns-would-have-caught)
11. [Checklist: adding a new resource](#11-checklist-adding-a-new-resource)

---

## 1. The request lifecycle

Every request flows through the same pipeline. Nothing skips a layer.

```
request
  → route (express router)          declares the path, wires middleware
  → requireAuth                     who are you? (session cookie → Redis)
  → validateParams / validateInput / validateQuery   is the input trustworthy?
  → controller                      thin: unpack input, call service, respond
  → service                         business rules, transactions, SQL
  → db (drizzle / postgres-js)      actual queries
  ← ApiResponse envelope            { success, statusCode, message, data }
      ↘ on any throw → globalError middleware → JSON error + log
```

Two consequences of this shape:

- **Controllers never touch the database.** If a controller needs a `JOIN`,
  that logic belongs in a service.
- **Services never read `req`.** They take plain typed arguments
  (`(id, data)`), which makes them callable from queues, cron jobs, or tests
  without fabricating an HTTP request.

---

## 2. What each layer is allowed to do

| Layer          | May do                                        | Must not do                       |
| -------------- | --------------------------------------------- | --------------------------------- |
| **Routes**     | declare paths, order middleware               | any logic                         |
| **Middleware** | authenticate, validate + replace raw input    | business rules                    |
| **Controller** | unpack validated input, pick status code      | SQL, multi-step business rules    |
| **Service**    | transactions, ownership checks, 4xx/5xx logic | read `req`, format HTTP responses |
| **DB/schema**  | column types, FKs, indexes, enums             | —                                 |

The one-line mental model: **middleware makes input trustworthy, services
make it _correct_, controllers just translate.**

---

## 3. Validation patterns (zod)

All request schemas live in `src/validations/<resource>.validation.ts`, and
every exported schema ships with an inferred type:

```ts
export type CreateJobForSubjectInput = z.infer<
  typeof createJobForSubjectSchema
>;
```

`z.infer` means the validation schema is the **single source of truth** for
both runtime checking _and_ TypeScript types. When the payload shape changes,
the compiler tells you which services/controllers broke.

### 3.1 `z.strictObject` — reject unknown keys

```ts
export const createPaymentSchema = z.strictObject({
  amount: paymentAmountSchema,
  paidAt: z.coerce.date().default(() => new Date()),
});
```

Why strict: if the frontend sends `{ amont: 2500 }` (typo), a normal object
schema silently drops it and the payment insert fails downstream with a
confusing NOT NULL error. `strictObject` fails immediately with
_"Unrecognized key: amont"_ — the bug is caught at the door.

### 3.2 `z.coerce` — HTTP input is always strings

Query strings and form data arrive as strings: `?limit=5` is `"5"`. Every
number and date in an incoming payload goes through `z.coerce`:

```ts
limit: z.coerce.number().int().positive().max(100).default(10),
paidAt: z.coerce.date().default(() => new Date()),
```

Coerce-first matches how the web actually works, and it also accepts real
numbers/JSON dates from `fetch` bodies — both clients are handled by one
schema.

### 3.3 `.default()` — the server decides missing values

```ts
status: z.enum(["pending", "completed", "canceled"]).default("pending"),
relationship: z.string().trim().min(1).max(50).default("self"),
```

After `validateInput` replaces `req.body` with the parsed value, **the
service never has to check for `undefined`** — `status` is always one of the
three enum values. Defaults encode business policy ("a new job is pending")
in the schema instead of scattering `?? "pending"` through the codebase.

### 3.4 `.optional()` vs `.nullish()` — and the 1970 trap

```ts
dueDate: z.coerce.date().nullish(),   // accepts absent, null, or a date
```

- `.optional()` — key may be _absent_.
- `.nullish()` — absent **or explicitly `null`**. Used for `dueDate` /
  `deliveredAt` because "clear this date" is a legitimate update
  (`PATCH /jobs/:id` with `{ "dueDate": null }`).

The trap that forced `nullish()`: with `z.coerce.date().optional()` alone,
sending `"dueDate": null` falls through to the date schema, and
`new Date(null)` is **1970-01-01** — a silently wrong date in your database
instead of a 400.

### 3.5 `superRefine` — rules that span multiple fields

```ts
const jobSubjectSchema = z.strictObject({ ... }).superRefine((subject, ctx) => {
  if (subject.relationship !== "self" && !subject.name) {
    ctx.addIssue({ code: "custom", path: ["name"], message: "…" });
  }
});
```

Single-field rules live on the fields; rules _between_ fields live in
`superRefine` (`name` required iff `relationship !== "self"`). `path: ["name"]`
puts the error on the exact field, so the frontend can highlight the right
input. The frontend shape we support even allows whole-array rules:
`subjects: z.array(jobSubjectSchema).length(1, "Exactly one subject is
required per job")` encodes the business rule "one subject per job" as a
validation error instead of a 500.

### 3.6 Limits must mirror the database

```ts
// numeric(12, 2) in Postgres caps values at 9999999999.99
agreedPrice: jobPriceSchema,   // .max(9999999999.99, "…")
```

If validation is looser than the column, you don't get a 400 — you get a
Postgres _numeric field overflow_ 500 at insert time. **Every numeric cap in
a schema quotes the column definition it protects.** This exact mismatch
already happened once (validation allowed 9999999999.99 while the column was
`numeric(6,2)`); the test suite caught it, and we widened the column.

### 3.7 The three validation middlewares

`src/middleware/validation.middleware.ts` has one middleware per request
compartment: `validateInput` (body), `validateParams` (path), `validateQuery`
(query string). All three do the same job — `safeParse`, throw
`ApiError(400, …, fieldErrors)` on failure, and **replace the raw value with
the parsed one**:

```ts
req.body = result.data; // body: defaults applied, coerced, trimmed
req.params = result.data; // params: still strings, but proven uuids
```

Because the middleware guarantees the shape, controllers can later write
`req.body as CreateJobNewCustomerInput` without a runtime check.

`validateQuery` has one Express 5 wrinkle worth understanding: `req.query`
is a **lazy getter**, not a plain property, so `req.query = parsed` throws.
The middleware therefore redefines the own property:

```ts
Object.defineProperty(req, "query", { value: result.data, … });
```

And because `@types/express` still _types_ `req.query` as `ParsedQs`, the
controller reads it with a double cast, documented inline:

```ts
const { limit } = req.query as unknown as TopCustomersQuery;
```

Runtime is guaranteed by the middleware; the cast is purely for the compiler.

---

## 4. Controller patterns

Controllers are deliberately boring. The whole job:

```ts
export const createJobForSubjectHandler = async (
  req: Request,
  res: Response,
) => {
  const { id: subjectId } = req.params as IdParams; // 1. unpack (validated)
  const data = req.body as CreateJobForSubjectInput; //    input
  const job = await createJobForSubject(subjectId, data); // 2. delegate
  res.status(201).json(new ApiResponse(201, "Job created successfully", job)); // 3. respond
};
```

Three conventions to notice:

1. **Status codes are chosen here** — `201` for creation, `200` for
   reads/updates/deletes. The service doesn't know HTTP exists.
2. **Plain `async` handlers.** Express 5 forwards rejected promises to the
   error middleware natively, so controllers don't need the `asyncHandler`
   wrapper (an Express 4 habit — in Express 4 an async throw would crash
   the process unhandled). It survives in `utils/` and is still used by the
   validation middlewares.
3. **One handler, one endpoint.** No shared "do things" handlers with mode
   flags; the route file decides which handler serves which verb.

---

## 5. Service patterns

`src/services/*.service.ts` is where correctness lives. The patterns below
are the reason the API behaves predictably.

### 5.1 Transactions for multi-table writes

```ts
const job = await db.transaction(async (tx) => {
  const [customer]  = await tx.insert(customersTable)…;
  const [subject]   = await tx.insert(subjectsTable)…;
  const [measurement] = await tx.insert(measurementsTable)…;
  const [newJob]    = await tx.insert(jobsTable)…;
  return newJob;
});
```

Creating a job for a new customer writes **four rows**. Without a
transaction, a failure on step 3 leaves an orphan customer+subject forever.
Inside `db.transaction`, any `throw` rolls back all four. Note we use `tx`
(the transaction handle) for _every_ query inside the callback — mixing in
`db` would silently escape the transaction.

### 5.2 `.returning()` + the array guard

```ts
const [newJob] = await tx.insert(jobsTable).values({ … }).returning();
if (!newJob) throw new ApiError(500, "Failed to create job");
```

Two things packed together:

- **`.returning()`** makes Postgres hand back the inserted row (with DB
  generated fields: `id`, `createdAt`). This was once missing in a draft —
  the insert _succeeded_ but the function read garbage and threw "Failed to
  create job" on every success. Rule: **if you need the row, ask for it.**
- **The guard after the destructure** is honest about a case that is
  virtually impossible (`INSERT … RETURNING` returning zero rows) but not
  _theoretically_ impossible — and it gives TypeScript a non-undefined value
  to return, satisfying `noUncheckedIndexedAccess`.

### 5.3 Status codes as a vocabulary: 404 / 409 / 500

Services throw `ApiError` with _meaningful_ codes:

- **404** — the entity genuinely doesn't exist (`Subject not found`).
- **409** — the request conflicts with business state (`Job has payments and
cannot be deleted`). A delete blocked by payments is not "not found"; 409
  tells the frontend to show a "this job has payments" message instead of a
  generic error.
- **500** — _our_ failure (an INSERT that should not fail). `globalError`
  logs 5xx with the full error object but only logs 4xx as a warning line.

### 5.4 Ownership and consistency checks

```ts
const [measurement] = await tx
  .select({ id: measurementsTable.id })
  .from(measurementsTable)
  .where(
    and(
      eq(measurementsTable.id, measurementId),
      eq(measurementsTable.subjectId, subjectId), // ← the ownership clause
    ),
  );
if (!measurement)
  throw new ApiError(404, "Measurement not found for this subject");
```

The FKs on `jobs` only check _existence_, not _fit_: without the second
`eq`, a client could attach **one customer's measurements to another
customer's job** and the database would accept it happily. Same idea, other
direction: `createJobForSubject` takes only `subjectId` and derives
`customerId` from the subject row — the client is never trusted to name both
sides of the relationship.

### 5.5 Pessimistic locking where money moves

```ts
const [job] = await tx
  .select({ id: jobsTable.id })
  .from(jobsTable)
  .where(eq(jobsTable.id, jobId))
  .for("update");
```

`FOR UPDATE` locks the job row until the transaction commits. Right now
`createPayment` just verifies existence, but the moment we add an
overpayment check (sum of payments vs `agreedPrice`), two simultaneous
payments could both read the same balance and both pass. Locking the job row
serializes payment attempts per job, so the future check is race-free.

### 5.6 Partial updates: `undefined` vs `null` in drizzle

```ts
export const updateJob = async (id: string, jobData: UpdateJobInput) => {
  if (Object.keys(jobData).length === 0)
    throw new ApiError(400, "No fields to update");
  const [job] = await db
    .update(jobsTable)
    .set(jobData)
    .where(eq(jobsTable.id, id))
    .returning();
  if (!job) throw new ApiError(404, "Job not found");
  return job;
};
```

The zod schema guarantees at least one key and that absent keys are absent
(not `undefined`) — drizzle skips `undefined` columns, and an explicit
`null` writes SQL `NULL` (clearing the date). So one `.set(jobData)` cleanly
handles "change status", "change status _and_ clear dueDate", and every
other combination, without building a patch object by hand.

### 5.7 Derived data is written, not computed everywhere

When `relationship === "self"`, the subject's name is _copied from_ the
customer at creation time:

```ts
const subjectName =
  subjectData.relationship === "self" ? customer.name : subjectData.name!;
```

Both write paths enforce this — `createJobNewCustomer` (job + subject born
together) and `addSubject` (`POST /customers/:id/subjects`, which also
resolves the customer's name and 404s on a bogus customer id _before_
inserting, turning what used to be a raw FK-violation 500 into a clean 404).
Its zod schema (`createSubjectSchema`) mirrors the rule with `superRefine`:
`name` is optional, but required when `relationship !== "self"`.

`subjects.name` is always populated, so every read path can use it directly.
`getJob` additionally guards against drift with a SQL `CASE` (see §6.1). The
general principle: decide once, explicitly, whether a value is _derived
on read_ (computed in SQL) or _denormalized on write_ (copied and stored) —
and never mix the two silently.

### 5.8 Reads that fan out: attach children with a second query, not a join

When one endpoint needs a parent _and_ a one-to-many collection (job + its
payments, customer + subjects + measurements + jobs), resist the urge to
join everything into one query. Joining job × payments multiplies the job
row once per payment — 4 payments means 4 identical job rows to dedupe.
Instead, run independent queries concurrently and assemble in JS:

```ts
const [job, payments] = await Promise.all([
  db.select({/* joined job row */}).from(jobsTable).where(eq(jobsTable.id, id)),
  db
    .select({
      id: paymentsTable.id,
      amount: paymentsTable.amount,
      paidAt: paymentsTable.paidAt,
    })
    .from(paymentsTable)
    .where(eq(paymentsTable.jobId, id))
    .orderBy(desc(paymentsTable.paidAt)),
]);
if (!job) throw new ApiError(404, "Job not found");
return { ...job, payments };
```

The parent query doubles as the 404 guard (a bogus id returns no job, and
the payments fetched alongside it are discarded), the parent row comes back
exactly once regardless of how many children it has, and total latency stays
at one round-trip because the queries run in parallel. Same shape as
`getCustomer`'s three-way fan-out.

---

## 6. When we drop to raw SQL (reports)

Drizzle's query builder is the default (`db.select()…`) because it is typed
and composable. Raw SQL via the postgres-js client (`pg` from
`config/db.ts`) is allowed for the things a builder can't express —
primarily **window functions**.

### 6.1 SQL expressions inside the builder

`getJob` needs "the customer's name for self-subjects, otherwise the
subject's own name". The tempting JS version is a bug:

```ts
// WRONG — evaluated in JavaScript at query-build time:
subjectName: subjectsTable.relationship === "self"   // column object === "self"
  ? customersTable.name : subjectsTable.name,        // always the else-branch!
```

A Drizzle column is an object, not a value — the ternary compiles no
decision into SQL at all. The correct form compiles the decision into a
**SQL `CASE`**:

```ts
subjectName: sql<string>`
  case when ${subjectsTable.relationship} = 'self'
    then ${customersTable.name}
    else ${subjectsTable.name}
  end`,
```

Rule of thumb: **a condition involving column _values_ must exist in SQL** —
via `.where()`, `case`, or a join — never as a JS ternary over column objects.

### 6.2 The monthly revenue report — window functions

```sql
with
  monthly_revenue as (
    select
      date_trunc ('month', paid_at) as month,
      sum(amount) as revenue
    from
      payments
    group by
      month
  )
select
  month,
  revenue,
  sum(revenue) over (
    order by
      month asc
  ) as running_total
from
  monthly_revenue
order by
  month asc
```

- `date_trunc('month', …)` buckets any payment date into its month.
- `sum(revenue) OVER (ORDER BY month)` is a **window function**: it sums
  across rows without collapsing them — the running total. The query builder
  has no clean equivalent, which is exactly why this report is raw SQL.
- In JS, rows are parsed once: `revenue: Number(row.revenue)`,
  `runningTotal: Number(row.running_total)`.

### 6.3 Money never gets an `::int` (or float) cast

postgres-js returns `numeric`/`count` as **strings** — that's Postgres
protecting precision. The instinctive `SUM(amount)::int` or
`Number(x)`-everywhere loses cents (and floats drift). Pattern: keep SQL
exact, parse the string **once** at the service boundary, and keep raw row
interfaces honest about it:

```ts
interface MonthlyRevenueRow {
  month: Date;
  revenue: string; // numeric arrives as a string
  running_total: string;
}
```

### 6.4 `topCustomers` — tracing money across a join path

```sql
from payments p
join jobs j on j.id = p.job_id
join customers c on c.id = j.customer_id
group by c.id
order by total_paid desc
limit ${limit}
```

There is no `customer_id` on `payments` — money is traced through the FK
path payment → job → customer. Two subtleties, both commented in the code:

- `GROUP BY c.id` alone suffices because `c.id` is the primary key; Postgres
  lets other `c.*` columns ride along (functional dependency).
- `${limit}` is interpolated by postgres-js as a **bound parameter** (`$1`),
  not string-concatenated — raw SQL here is still injection-safe.

The ranking is by `sum(p.amount)` — money paid — _not_ by job count. That
distinction was an explicit product decision.

### 6.5 `outstandingPayments` — LEFT JOIN, COALESCE, HAVING

```sql
from
  jobs j
  join customers c on c.id = j.customer_id
  join subjects s on s.id = j.subject_id
  left join payments p on p.job_id = j.id
group by
  j.id,
  c.id,
  s.id
having
  j.agreed_price - coalesce(sum(p.amount), 0) <> 0
order by
  balance_due desc
```

- **`LEFT JOIN` is load-bearing.** An inner join would drop jobs with _zero_
  payments — the most outstanding jobs of all. `COALESCE(sum(…), 0)` turns
  "no payments" into a number.
- **`HAVING`, not `WHERE`:** the balance exists only _after_ grouping;
  `WHERE` filters rows before aggregation and cannot see it.
- `balanceDue = agreedPrice − totalPaid`: **positive = still owed** (sorted
  most-owed first), negative = overpaid. If you only want debtors, change
  the `HAVING` to `> 0`.

### 6.6 Timezone traps in date formatting

`monthlyRevenue` returns both a machine key and a display label:

```ts
monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
month: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
```

`date.toISOString().slice(0, 7)` looks equivalent but isn't: ISO conversion
shifts to UTC, and midnight local becomes _the previous day_ UTC — so a
September bucket could be labeled `2026-08`. Always derive calendar parts
from local getters (or store `date_trunc` output as a date column).

---

## 7. Errors and responses

Two tiny classes in `src/utils/apiResponse.ts` define the entire API's
contract:

```ts
new ApiResponse(201, "Job created successfully", job);
// → { "success": true, "statusCode": 201, "message": "…", "data": { … } }

throw new ApiError(404, "Job not found");
// → globalError → { "success": false, "message": "Job not found" }
```

- `ApiResponse.success` is _derived_ (`statusCode < 400`) — one less thing
  to keep honest by hand.
- `ApiError` carries an optional `errors: FieldError[]` array — that's how
  zod issues reach the frontend as `{ field, message }` pairs it can map
  onto form inputs (`field` is the dotted path, e.g. `subjects.0.name`).
- `globalError` is the single place errors become JSON: known `ApiError`s
  pass through; unknown ones become 500s (logged with full stack in dev,
  message hidden behind the standard error shape).
- `notFound` turns unmatched URLs into the same JSON shape — no HTML 404s.

The payoff: **services throw, middleware throws, nobody writes
`try/catch`**, and every client gets the same envelope on every outcome.
That's what makes the frontend's error handling trivial later.

---

## 8. Database conventions

- **Money is `numeric(12, 2)`** (`agreedPrice`, `payments.amount`) — exact
  decimals, ~10 digits of headroom. Validation caps quote this: `.max(9999999999.99)`.
- **Free-form shapes are `jsonb`** (`measurements`, `styleRef`,
  `finishedJob`) with a `$type<…>()` annotation so drizzle types the column.
- **FK delete rules are deliberate:** `subjects.customerId` cascades
  (a customer's subjects are meaningless alone), while
  `jobs.customerId/subjectId/measurementId` and `payments.jobId` **restrict**
  (you must settle the job first — `deleteJob`'s 409 exists so users get a
  clean error instead of an FK 500).
- **Migrations are generated, not hand-written** (`bun run db:generate` →
  review the SQL → `bun run db:migrate`). e.g. the price-cap widening
  produced exactly one line: `ALTER TABLE "jobs" ALTER COLUMN "agreed_price"
SET DATA TYPE numeric(12, 2);`. Never `db:push` on a shared database.
- **Env vars are zod-validated at boot** (`config/env.ts`) — same
  fail-fast philosophy as request validation, applied to configuration.

---

## 9. Express 5 notes

Three version-specific behaviors the code depends on:

1. **Async handlers are safe plain functions.** Express 5 forwards rejected
   promises to `globalError`; the `asyncHandler` wrapper is no longer needed
   (it remains in `utils/` for middleware that predates the convention).
2. **`req.query` is a getter** — assignment throws; `validateQuery`
   redefines the property (§3.7).
3. **`req.params` stays assignable**, which is why `validateParams` can
   still do `req.params = result.data`.

---

## 10. Real bugs these patterns would have caught

Each of these actually happened during development — they're the best
argument for the rules above:

| Bug                                                                | Lesson now encoded                                |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| `INSERT` without `.returning()` — success threw "Failed to create" | §5.2 — if you need the row, ask for it            |
| JS ternary over a Drizzle column in a select                       | §6.1 — column-value logic must be SQL (`CASE`)    |
| Validation cap 9999999999.99 vs column `numeric(6,2)`              | §3.6 — caps mirror the column; tests enforce it   |
| `m.monthly_total` reading a column aliased `revenue`               | §6.2 — response fields must match SQL aliases     |
| `z.coerce.date()` turning explicit `null` into 1970-01-01          | §3.4 — `.nullish()` for clearable dates           |
| Job creation could pair one customer's measurements with another's | §5.4 — ownership clauses + derive IDs server-side |

---

## 11. Checklist: adding a new resource

The jobs resource is the reference implementation; every new resource
follows the same five moves:

1. **Schema** — `src/db/schema/<x>.ts`: columns, FKs with deliberate delete
   rules, indexes for anything you'll filter on.
2. **Validation** — `src/validations/<x>.validation.ts`: `strictObject`
   schemas per operation, `z.coerce` for primitives, `.default()` for
   policy, caps that mirror columns, `superRefine` for cross-field rules.
   Export the inferred `XInput` types.
3. **Service** — `src/services/<x>.service.ts`: one exported function per
   use case, transactions for multi-table writes, `.returning()` + guards,
   404/409 semantics, ownership checks.
4. **Controller** — `src/controllers/<x>.controller.ts`: unpack → delegate →
   `ApiResponse` with the right status code. Nothing else.
5. **Routes + mount** — `src/routes/<x>.routes.ts` ordering
   `requireAuth → validateParams → validateInput/validateQuery → handler`,
   then mount in `app.ts` under `/api/v1/<x>`.

Add validation unit tests alongside (see `tests/*.validation.test.ts` — they
run in milliseconds and need no database), and update
`docs/04-api-design.md`.
