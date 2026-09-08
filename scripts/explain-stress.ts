import postgres from "postgres";
import { env } from "../src/config/env";

type PlanRow = Record<string, string>;

const TABLES = [
  "customers",
  "subjects",
  "measurements",
  "jobs",
  "payments",
] as const;

const printCounts = (label: string, counts: Record<string, string>) => {
  console.log(`\n=== ${label} ===`);
  for (const table of TABLES)
    console.log(`  ${table.padEnd(13)} ${counts[table]}`);
};

class Rollback extends Error {}

const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });

const [before] = await sql<
  {
    customers: string;
    subjects: string;
    measurements: string;
    jobs: string;
    payments: string;
  }[]
>`
  select
    (select count(*) from customers)::text as customers,
    (select count(*) from subjects)::text as subjects,
    (select count(*) from measurements)::text as measurements,
    (select count(*) from jobs)::text as jobs,
    (select count(*) from payments)::text as payments`;

if (!before) throw new Error("count query returned no rows");

printCounts("BEFORE — real data only", before);

const [realCustomer] = await sql<{ id: string }[]>`
  select id from customers order by created_at limit 1`;

if (realCustomer) {
  const rows = (await sql`
    explain (analyze, buffers)
    select id, name, relationship
    from subjects
    where customer_id = ${realCustomer.id}::uuid
    order by created_at`) as unknown as PlanRow[];
  console.log("\n=== BASELINE: listSubjects on real data ===");
  console.log(rows.map((r) => Object.values(r)[0]).join("\n"));
} else {
  console.log("\n(no customers yet — skipping baseline explain)");
}

try {
  await sql.begin(async (tx) => {
    await tx`
      insert into customers (name, phone_number)
      select 'Stress #' || g,
             case when g % 3 = 0 then '+23480' || lpad(g::text, 8, '0') end
      from generate_series(1, 400) g`;

    await tx`
      insert into subjects (customer_id, name, relationship)
      select c.id,
             case when s = 1 then c.name else 'Relative ' || s end,
             case when s = 1 then 'self' else 'relative' end
      from customers c
      cross join generate_series(1, (2 + floor(random() * 5))::int) as s
      where c.name like 'Stress %'`;

    await tx`
      insert into measurements (subject_id, measurements, date)
      select sub.id,
             jsonb_build_object(
               'bust', 28 + floor(random() * 14),
               'waist', 22 + floor(random() * 12),
               'hip', 30 + floor(random() * 16),
               'sleeve', 20 + floor(random() * 10)),
             current_date - floor(random() * 500)::int
      from subjects sub
      join customers c on c.id = sub.customer_id and c.name like 'Stress %'
      cross join generate_series(1, (1 + floor(random() * 4))::int) as m`;

    await tx`
      insert into jobs (customer_id, subject_id, measurement_id, style_ref, finished_job,
                        agreed_price, status, due_date, delivered_at)
      select sub.customer_id, sub.id, mm.id,
             '[{"url":"https://example.com/style.jpg","alt":"reference"}]'::jsonb,
             '[{"url":"https://example.com/finished.jpg","alt":"result"}]'::jsonb,
             round((2000 + random() * 480000)::numeric, 2),
             (array['pending','completed','canceled'])[1 + floor(random() * 3)::int]::job_status,
             current_date + floor(random() * 60 - 30)::int,
             case when random() < 0.5
                  then now() - (floor(random() * 300)::int * interval '1 day') end
      from subjects sub
      join customers c on c.id = sub.customer_id and c.name like 'Stress %'
      cross join lateral (
        select id from measurements m where m.subject_id = sub.id order by random() limit 1
      ) mm
      cross join generate_series(1, (1 + floor(random() * 6))::int) as j`;

    await tx`
      insert into payments (job_id, amount, paid_at)
      select j.id,
             round((j.agreed_price / (2 + floor(random() * 4)))::numeric, 2),
             current_date - floor(random() * 1000)::int
      from jobs j
      join customers c on c.id = j.customer_id and c.name like 'Stress %'
      cross join generate_series(1, floor(random() * 4)::int) as p`;

    const [during] = await tx<
      {
        customers: string;
        subjects: string;
        measurements: string;
        jobs: string;
        payments: string;
      }[]
    >`
      select
        (select count(*) from customers)::text as customers,
        (select count(*) from subjects)::text as subjects,
        (select count(*) from measurements)::text as measurements,
        (select count(*) from jobs)::text as jobs,
        (select count(*) from payments)::text as payments`;

    if (!during) throw new Error("count query returned no rows");

    printCounts("INSIDE TRANSACTION — stress rows added", during);

    try {
      await tx`analyze customers, subjects, measurements, jobs, payments`;
    } catch {
      console.log("\n(analyze inside transaction skipped)");
    }

    const [customer] = await tx<{ id: string }[]>`
      select id from customers where name like 'Stress %' order by random() limit 1`;
    const [subject] = await tx<{ id: string }[]>`
      select id from subjects where name like 'Relative %' limit 1`;
    const [job] = await tx<{ id: string }[]>`
      select j.id
      from jobs j
      join customers c on c.id = j.customer_id
      where c.name like 'Stress %'
        and exists (select 1 from payments p where p.job_id = j.id)
      order by random()
      limit 1`;

    if (!customer || !subject || !job)
      throw new Error("failed to pick sample rows");

    const explain = async (
      title: string,
      run: (t: typeof tx) => Promise<unknown>,
    ) => {
      const rows = (await run(tx)) as PlanRow[];
      console.log(`\n=== ${title} ===`);
      console.log(rows.map((r) => Object.values(r)[0]).join("\n"));
    };

    await explain(
      "listSubjects — WITH the subjects_customer_id_idx index",
      (t) => t`
      explain (analyze, buffers)
      select id, name, relationship
      from subjects
      where customer_id = ${customer.id}::uuid
      order by created_at`,
    );

    await tx`set enable_indexscan = off`;
    await tx`set enable_bitmapscan = off`;
    await explain(
      "listSubjects — SAME query, index scans disabled (planner forced to Seq Scan)",
      (t) => t`
      explain (analyze, buffers)
      select id, name, relationship
      from subjects
      where customer_id = ${customer.id}::uuid
      order by created_at`,
    );
    await tx`reset all`;

    await explain(
      "listMeasurements — WITH measurements_subject_id_idx",
      (t) => t`
      explain (analyze, buffers)
      select id, subject_id, measurements, date
      from measurements
      where subject_id = ${subject.id}::uuid
      order by date desc`,
    );

    await explain(
      "listCustomerJobs — join + sort",
      (t) => t`
      explain (analyze, buffers)
      select j.id, s.name as subject_name, j.agreed_price, j.status, j.created_at
      from jobs j
      join subjects s on s.id = j.subject_id
      where j.customer_id = ${customer.id}::uuid
      order by j.created_at desc`,
    );

    await explain(
      "getJob — 4-way join",
      (t) => t`
      explain (analyze, buffers)
      select j.id, c.name as customer_name, s.name as subject_name, m.measurements, j.agreed_price, j.status
      from jobs j
      join customers c on c.id = j.customer_id
      join subjects s on s.id = j.subject_id
      join measurements m on m.id = j.measurement_id
      where j.id = ${job.id}::uuid`,
    );

    await explain(
      "getJob — payments (newest first)",
      (t) => t`
      explain (analyze, buffers)
      select id, amount, paid_at
      from payments
      where job_id = ${job.id}::uuid
      order by paid_at desc`,
    );

    await explain(
      "monthlyRevenue report — window function",
      (t) => t`
      explain (analyze, buffers)
      with monthly_revenue as (
        select date_trunc('month', paid_at) as month, sum(amount) as revenue
        from payments
        group by month
      )
      select month, revenue, sum(revenue) over (order by month asc) as running_total
      from monthly_revenue
      order by month asc`,
    );

    await explain(
      "outstandingPayments report — LEFT JOIN + HAVING",
      (t) => t`
      explain (analyze, buffers)
      select j.id, c.name as customer_name, s.name as subject_name, j.status, j.due_date,
             j.agreed_price, coalesce(sum(p.amount), 0) as total_paid,
             j.agreed_price - coalesce(sum(p.amount), 0) as balance_due
      from jobs j
      join customers c on c.id = j.customer_id
      join subjects s on s.id = j.subject_id
      left join payments p on p.job_id = j.id
      group by j.id, c.id, s.id
      having j.agreed_price - coalesce(sum(p.amount), 0) > 0
      order by balance_due desc`,
    );

    throw new Rollback("stress complete — rolling back");
  });
} catch (error) {
  if (!(error instanceof Rollback)) throw error;
}

console.log("\n=== ROLLBACK issued ===");

const [after] = await sql<
  {
    customers: string;
    subjects: string;
    measurements: string;
    jobs: string;
    payments: string;
  }[]
>`
  select
    (select count(*) from customers)::text as customers,
    (select count(*) from subjects)::text as subjects,
    (select count(*) from measurements)::text as measurements,
    (select count(*) from jobs)::text as jobs,
    (select count(*) from payments)::text as payments`;

if (!after) throw new Error("count query returned no rows");

printCounts("AFTER ROLLBACK — verify zero rows persisted", after);

await sql.end();
console.log("\nDone. Database is exactly as it was before.");
