# Backend patterns, decisions, and how to read this codebase

This guide explains the Hollyseams backend as it exists in this repository. It is not a generic Express or Drizzle tutorial. The examples use the real routes, validation schemas, controllers, services, database schema, reports, pagination code, and stress-test scripts.

The goal is to help you answer four questions whenever you open a file:

1. Where does this request enter the application?
2. Where is its input checked and transformed?
3. Which layer owns the business rule?
4. What SQL is eventually sent to PostgreSQL?

If you can answer those four questions, you can usually change the backend safely.

## 1. The big picture

A request travels through the application like this:

```text
HTTP request
  -> Express route
  -> authentication middleware
  -> validation middleware
  -> controller
  -> service
  -> Drizzle or postgres-js
  -> PostgreSQL

success:  service result -> controller -> ApiResponse -> JSON
failure:  anything throws -> globalError -> error JSON
```

For example, `GET /api/v1/jobs` is mounted like this:

```ts
app.use("/api/v1/jobs", jobsRouter);
```

Then the jobs router adds the remaining path and middleware:

```ts
router.get(
  "/",
  requireAuth,
  validateQuery(listItemsQuerySchema),
  listJobsHandler,
);
```

The request therefore passes through:

```text
GET /api/v1/jobs
  -> requireAuth
  -> validateQuery(listItemsQuerySchema)
  -> listJobsHandler
  -> listJobs(query)
  -> jobs table
```

### The responsibility rule

- **Routes** describe where a request goes.
- **Middleware** authenticates and validates input.
- **Controllers** translate HTTP into service calls and service results into HTTP responses.
- **Services** contain business rules and database operations.
- **Schemas** describe the database structure and constraints.

A useful phrase is:

> Middleware makes input trustworthy. Services make operations correct. Controllers translate.

Controllers should not contain SQL. Services should not read `req` or `res`. This keeps services reusable from HTTP handlers, jobs, scripts, or tests.

## 2. Routes and middleware

A route should mostly be wiring:

```ts
router.patch(
  "/:id",
  requireAuth,
  validateParams(idParamsSchema),
  validateInput(updateJobSchema),
  updateJobHandler,
);
```

The usual order is:

```text
requireAuth
  -> validateParams
  -> validateInput or validateQuery
  -> handler
```

Authentication comes first because unauthenticated callers should not reach protected business logic. Validation comes before the controller so the controller can trust the shape it receives.

### Authentication

`requireAuth` reads the `sessionId` cookie, looks up the session in Redis, validates the stored session object, attaches the user to `req.user`, and refreshes the Redis expiry.

```ts
const sessionId = req.cookies?.sessionId as string | undefined;
if (!sessionId) throw new ApiError(401, "Not authenticated");
```

Authentication is not authorization. The current application has one authenticated user and does not yet have per-user permissions. If roles or ownership rules are added later, they belong in a separate authorization middleware or in explicit service checks.

### Validation middleware

There are three input locations:

```ts
validateInput(schema); // req.body
validateParams(schema); // req.params
validateQuery(schema); // req.query
```

Each uses `safeParse`. On failure it throws a 400 `ApiError` containing field-level errors. On success it replaces the raw request value with parsed data, so defaults, coercion, and trimming have already happened before the controller runs.

Express 5 treats `req.query` differently from `req.params`: `req.query` is a getter. That is why `validateQuery` redefines the property instead of assigning to it directly.

## 3. Validation with Zod

Validation schemas live in `src/validations`. They are both runtime contracts and TypeScript type sources:

```ts
export const createPaymentSchema = z.strictObject({
  amount: z.coerce.number().positive(),
  paidAt: z.coerce.date().default(() => new Date()),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
```

There is one source of truth: the schema. `z.infer` prevents the TypeScript type and runtime validation rules from drifting apart.

### Strict objects

The project uses `z.strictObject` so unexpected keys fail immediately:

```ts
z.strictObject({ amount: paymentAmountSchema });
```

A typo such as `{ ammount: 2500 }` should produce a clear 400 instead of silently dropping the key and causing a confusing database error later.

### Coercion

HTTP query parameters arrive as strings:

```http
GET /api/v1/jobs?limit=20
```

The actual raw value is `"20"`, not the number `20`. That is why query schemas use:

```ts
limit: z.coerce.number().int().positive().max(100);
```

Dates use the same idea:

```ts
paidAt: z.coerce.date();
```

### Optional versus nullable

These are different requests:

```json
{}
```

means "do not change this field", while:

```json
{ "dueDate": null }
```

means "clear this field".

For PATCH fields that can be cleared, the schema uses `.nullish()`:

```ts
dueDate: z.coerce.date().nullish(),
deliveredAt: z.coerce.date().nullish(),
```

Be careful with `z.coerce.date().optional()` alone. In JavaScript, `new Date(null)` becomes 1970-01-01, so an explicit JSON `null` can accidentally become a real date instead of clearing the field.

### Cross-field rules

A field rule cannot express "name is required unless relationship is self". That is a relationship between two fields, so the project uses `superRefine`:

```ts
.superRefine((subject, ctx) => {
  if (subject.relationship !== "self" && !subject.name) {
    ctx.addIssue({
      code: "custom",
      path: ["name"],
      message: 'Subject name is required when relationship is not "self"',
    });
  }
});
```

The error path matters: the frontend can attach the error directly to the `name` input.

The job creation schema also requires exactly one subject:

```ts
subjects: z.array(jobSubjectSchema).length(1);
```

The database may allow many subjects per customer, but this endpoint creates one subject per job. That is an endpoint rule, so it belongs in validation.

### Validation must agree with PostgreSQL

Jobs and payments use `numeric(12, 2)`. The validation maximum is therefore `9999999999.99`.

If Zod accepts a value the database cannot store, the client receives a late 500 instead of an early 400. Database precision, validation limits, and tests must be changed together.

## 4. Controllers

Controllers should be boring. Their normal shape is:

```ts
export const getJobHandler = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const job = await getJob(id);

  res.status(200).json(new ApiResponse(200, "Job fetched successfully", job));
};
```

The controller does three things:

1. Unpack validated parameters, body, or query.
2. Call one service function.
3. Choose the HTTP status and response message.

It should not decide whether a job can be deleted, calculate payment balances, or build SQL. Those are service responsibilities.

Express 5 forwards rejected promises from async handlers to the error middleware. The project still has `asyncHandler`, and it is used by some older handlers and validation middleware, but plain async controllers are safe under Express 5.

## 5. Services

Services are the most important layer because they protect data correctness.

### Creating related records atomically

Creating a job for a new customer creates four records:

```text
customer -> subject -> measurement -> job
```

The service wraps those inserts in a transaction:

```ts
const job = await db.transaction(async (tx) => {
  const [customer] = await tx.insert(customersTable).values(...).returning();
  const [subject] = await tx.insert(subjectsTable).values(...).returning();
  const [measurement] = await tx.insert(measurementsTable).values(...).returning();
  const [newJob] = await tx.insert(jobsTable).values(...).returning();
  return newJob;
});
```

If the measurement or job insert fails, the customer and subject inserts roll back too. Use `tx` for every query inside the callback. Accidentally using `db` inside the transaction escapes the transaction and can leave partial data behind.

### Returning inserted rows

Drizzle insert and update operations return arrays. If the service needs the created row, it must request it:

```ts
const [newJob] = await tx.insert(jobsTable).values(values).returning();

if (!newJob) throw new ApiError(500, "Failed to create job");
```

Without `.returning()`, the insert can succeed while the service receives no row. That was a real bug in this codebase.

### Ownership checks

Foreign keys prove that an ID exists. They do not always prove that two IDs belong together.

This check is important:

```ts
.where(
  and(
    eq(measurementsTable.id, measurementId),
    eq(measurementsTable.subjectId, subjectId),
  ),
)
```

Without `eq(measurementsTable.subjectId, subjectId)`, a caller could attach a measurement belonging to one subject to a job for another subject. The database would accept both IDs because both rows exist.

When possible, derive related IDs on the server. `createJobForSubject` receives a subject ID and obtains the customer ID from the subject instead of trusting the client to send both.

### Error vocabulary

Services use `ApiError` to communicate meaningful outcomes:

- `400`: the request cannot be processed as sent;
- `401`: authentication failed;
- `404`: the requested entity does not exist;
- `409`: the entity exists but its current state conflicts with the request;
- `500`: an unexpected server or database failure.

Deleting a job with payments is a `409`, not a `404`: the job exists, but its state prevents deletion.

### Payment locking

`createPayment` selects the job with `FOR UPDATE`:

```ts
.where(eq(jobsTable.id, jobId))
.for("update");
```

The lock lasts until the transaction commits. It currently protects the job existence check. It also provides the correct foundation for a future overpayment check: concurrent payment requests for the same job will wait instead of both reading and spending the same balance.

## 6. Reads with related records

A one-to-many join can multiply a parent row. A job with four payments becomes four SQL rows containing the same job data.

`getJob` therefore runs two queries concurrently:

```ts
const [job, payments] = await Promise.all([
  // one joined job row
  db.select(...).from(jobsTable).where(eq(jobsTable.id, id)),

  // zero or more payment rows
  db.select({ id, amount, paidAt })
    .from(paymentsTable)
    .where(eq(paymentsTable.jobId, id))
    .orderBy(desc(paymentsTable.paidAt)),
]);
```

The response is assembled as:

```ts
return { ...job, payments };
```

This keeps the job as one object and payments as an array. A valid job with no payments returns `payments: []`.

The same principle applies to a customer with subjects, measurements, and jobs: separate fan-out queries are often easier to understand and avoid deduplicating a Cartesian multiplication in JavaScript.

## 7. Cursor pagination

Cursor pagination means:

> Return rows after a bookmark instead of skipping a number of rows with OFFSET.

Your previous implementation is the simple form:

```ts
const conditions = cursor
  ? and(
      eq(activitiesTable.cardId, cardId),
      lt(activitiesTable.createdAt, new Date(cursor)),
    )
  : eq(activitiesTable.cardId, cardId);

const activities = await db
  .select(...)
  .from(activitiesTable)
  .where(conditions)
  .orderBy(desc(activitiesTable.createdAt))
  .limit(limit + 1);
```

The project uses the same five steps:

1. Read the cursor if one was provided.
2. Filter after the cursor.
3. Order consistently.
4. Fetch `limit + 1` rows.
5. Use the extra row to decide whether another page exists.

### Why the project cursor has two values

`GET /jobs` orders by:

```ts
.orderBy(desc(jobsTable.createdAt), desc(jobsTable.id))
```

The cursor therefore contains:

```text
createdAt|id
```

The first value is the normal sort value. The ID is a deterministic tie-breaker.

Suppose the order is:

```text
createdAt  id
10:00      Z
10:00      Y
10:00      X
09:59      A
```

With a page size of two:

```text
page 1: Z, Y
cursor: 10:00|Y
```

The next condition is:

```sql
WHERE
  (created_at, id) < ('10:00', 'Y')
```

That means:

```sql
WHERE
  created_at < '10:00'
  OR (
    created_at = '10:00'
    AND id < 'Y'
  )
```

The next page is `X, A`.

A timestamp-only cursor would be:

```sql
WHERE
  created_at < '10:00'
```

That would skip `X`, because `X.created_at` equals the cursor instead of being less than it. Changing `<` to `<=` would duplicate `Z` and `Y`.

This is why `cursor.ts` exists. It centralizes:

- splitting `value|id`;
- checking the UUID;
- checking timestamp syntax;
- constructing the row-wise comparison.

It is still the same cursor idea as your previous method. The only conceptual addition is the ID tie-breaker.

### `limit + 1`

If the client asks for 10 rows, the service asks PostgreSQL for 11:

```ts
.limit(limit + 1)
```

If 11 arrive, there is another page. Return the first 10 and create a cursor from the tenth. If only 10 or fewer arrive, `nextCursor` is `null`.

This avoids an expensive `COUNT(*)` on every request.

### Cursor precision warning

The current job implementation creates its cursor with:

```ts
last.createdAt.toISOString();
```

JavaScript `Date` stores milliseconds, while PostgreSQL `timestamptz` can store microseconds. A database value such as:

```text
2026-09-07 22:56:56.047399+00
```

can become:

```text
2026-09-07T22:56:56.047Z
```

The microseconds are lost. That means the composite design is correct, but the timestamp representation should be fixed before treating this as production-ready. A robust implementation should preserve the database timestamp text for the cursor or deliberately normalize both database values and cursors to the same precision.

### Customers use the same machinery

`GET /customers` is ordered by:

```ts
.orderBy(asc(customersTable.name), asc(customersTable.id))
```

Its cursor is:

```text
name|id
```

Because this is ascending, the next-page comparison uses `>` instead of `<`.

The reusable idea is:

```text
DESC list -> rows less than the cursor row
ASC list  -> rows greater than the cursor row
```

## 8. Indexes and query shape

An index is useful when it matches how a query finds or orders rows. A foreign key does not automatically create an index in PostgreSQL.

The project has indexes for:

- `subjects.customer_id` — used by customer subject lists;
- `measurements.subject_id` — used by subject measurement lists;
- `jobs.customer_id` — used by per-customer job lists and reports;
- `jobs.created_at, jobs.id` — used by job cursor pagination;
- `payments.job_id, payments.paid_at` — used when fetching a job's payments in date order;
- job status and due date — useful for future job-board queries.

The important index for cursor pagination is the same as the ordering:

```sql
CREATE INDEX ... ON jobs (created_at, id);
```

Without it, PostgreSQL may scan and sort the whole jobs table for every page. With it, PostgreSQL can walk the index backward and stop after `limit + 1` rows.

Indexes are not automatically used just because they exist. PostgreSQL may correctly choose a sequential scan for a tiny table because reading the whole table is cheaper than performing an index lookup. Use `EXPLAIN (ANALYZE, BUFFERS)` with realistic data before judging an index.

## 9. Reports and raw SQL

Drizzle's query builder is the default. Reports use postgres-js raw SQL where SQL is clearer or where window functions are needed.

### Monthly revenue

The report first groups payments by month:

```sql
WITH
  monthly_revenue AS (
    SELECT
      date_trunc ('month', paid_at) AS month,
      sum(amount) AS revenue
    FROM
      payments
    GROUP BY
      month
  )
SELECT
  month,
  revenue,
  sum(revenue) OVER (
    ORDER BY
      month
  ) AS running_total
FROM
  monthly_revenue
ORDER BY
  month;
```

`GROUP BY` reduces many payments to one row per month. The window function calculates a running total without collapsing those monthly rows.

### Top customers

Payments do not contain `customer_id`, so the report follows the relationship:

```text
payments -> jobs -> customers
```

It ranks by:

```sql
sum(p.amount) AS total_paid
ORDER BY
  total_paid DESC
```

It does not rank by job count. Job count is extra context only.

### Outstanding payments

The report uses `LEFT JOIN payments` because a job with zero payments is still outstanding. `COALESCE(sum(p.amount), 0)` converts the no-payment case into numeric zero. The balance is calculated after grouping, so the filter belongs in `HAVING`, not `WHERE`:

```sql
HAVING
  j.agreed_price - coalesce(sum(p.amount), 0) > 0
```

Money remains exact in PostgreSQL. The service converts aggregate results once at the boundary because raw PostgreSQL numeric values can arrive as strings.

## 10. Errors and response envelopes

Successful responses use `ApiResponse`:

```ts
new ApiResponse(200, "Jobs fetched successfully", jobs, {
  nextCursor,
});
```

The JSON shape is:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Jobs fetched successfully",
  "data": [],
  "meta": {
    "nextCursor": "..."
  }
}
```

The `meta` property is optional, so non-paginated responses do not need to include it.

Validation and service failures throw `ApiError`:

```ts
throw new ApiError(404, "Job not found");
```

`globalError` converts errors into JSON and logs server failures. In development it can include a stack trace; production should not expose internal details.

The frontend can therefore handle errors consistently:

```text
if success === true: use data
if success === false: show message and field errors when present
```

## 11. Stress-test scripts and EXPLAIN

The repository contains three learning scripts:

```bash
bun scripts/stress-seed.ts
bun scripts/explain-stress.ts
bun scripts/stress-cleanup.ts
```

### Persistent experiment

To populate the development database:

```bash
bun scripts/stress-seed.ts
```

The default creates roughly:

```text
400 customers
2,400 subjects
7,200 measurements
9,600 jobs
up to about 28,800 payments
```

Stress customers are named `Stress #1`, `Stress #2`, and so on. The cleanup script uses that marker and foreign-key lineage, so it does not touch normal application data.

When finished:

```bash
bun scripts/stress-cleanup.ts
```

The cleanup deletes payments first, then jobs, measurements, subjects, and stress customers, all inside one transaction. It runs `ANALYZE` afterward so PostgreSQL statistics reflect the restored database.

### Temporary experiment

`explain-stress.ts` inserts rows inside a transaction and deliberately rolls the transaction back. It is useful when you want a one-command experiment without persistent stress data:

```bash
bun scripts/explain-stress.ts
```

### Reading an EXPLAIN plan

Run a read-only query like this:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT ...;
```

Read the output from the bottom upward:

1. Find the deepest scan. That is where PostgreSQL gets the rows.
2. Follow each parent node to see filtering, joining, sorting, or grouping.
3. Compare estimated `rows=` with `actual rows=`.
4. Look for `Rows Removed by Filter`.
5. Look for `Sort Method: external merge` and `Disk:` — that means a sort spilled to disk.
6. Compare `Buffers: shared hit` and `read` to understand page activity.
7. Check total `Execution Time`, but do not trust a single timing run blindly.

`ANALYZE` executes the statement. It is safe for SELECT queries, but never run it casually against UPDATE or DELETE. For writes, use a transaction you will explicitly roll back, or use plain `EXPLAIN` without `ANALYZE`.

A healthy cursor plan for jobs should look conceptually like:

```text
Index Scan Backward using jobs_created_at_id_idx
  -> fetch only limit + 1 jobs
  -> lookup each subject by primary key
```

The important signs are that PostgreSQL can use the ordering index, there is no full-table sort, and work stays close to the page size instead of growing with the total number of jobs.

## 12. A checklist for new work

When adding an endpoint:

1. **Define the database shape.** Add columns, foreign keys, delete behavior, and indexes for real filters/orderings.
2. **Define the input contract.** Add a strict Zod schema and export its inferred type.
3. **Write the service.** Put business rules, transactions, ownership checks, and queries there.
4. **Write the controller.** Unpack validated input, call the service, and return `ApiResponse`.
5. **Wire the route.** Use authentication and the appropriate validation middleware.
6. **Add tests.** Validation tests are fast; service/integration tests protect database behavior.
7. **Check the query plan.** Use realistic data and `EXPLAIN (ANALYZE, BUFFERS)` when a query filters, joins, sorts, aggregates, or paginates.
8. **Update this guide or the API documentation** when a new pattern or decision is introduced.

The main discipline is separation: validate at the boundary, enforce correctness in the service, and keep the controller thin enough that the important behavior is easy to find.
