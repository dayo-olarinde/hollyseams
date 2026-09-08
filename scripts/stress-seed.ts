/**
 * Stress seed — populates the DEV database with thousands of marked rows so
 * EXPLAIN plans can be read on real, persistent data.
 *
 * Every row descends from a customer named "Stress #<n>", which is the only
 * thing scripts/stress-cleanup.ts keys on to remove the subtree. Your real
 * data is never touched: no truncates, no dumps, no restore step.
 *
 * Re-runnable: safe to run again after a cleanup or partway (existing stress
 * customers are counted, not duplicated).
 *
 * Run: bun scripts/stress-seed.ts
 */
import postgres from "postgres";
import { env } from "../src/config/env";

const STRESS_CUSTOMERS = Number(process.argv[2] ?? 400);
const SUBJECTS_PER_CUSTOMER = 6;
const MEASUREMENTS_PER_SUBJECT = 3;
const JOBS_PER_SUBJECT = 4;

const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });

const [existing] = await sql<{ count: string }[]>`
  select count(*)::text as count from customers where name like 'Stress #%'`;

if (existing && Number(existing.count) > 0) {
  console.log(
    `Stress data already present (${existing.count} stress customers). ` +
      "Run scripts/stress-cleanup.ts first if you want a fresh set.",
  );
} else {
  await sql.begin(async (tx) => {
    await tx`
      insert into customers (name, phone_number)
      select 'Stress #' || g,
             case when g % 3 = 0 then '+23480' || lpad(g::text, 8, '0') end
      from generate_series(1, ${STRESS_CUSTOMERS}) g`;

    await tx`
      insert into subjects (customer_id, name, relationship)
      select c.id,
             case when s = 1 then c.name else 'Relative ' || s end,
             case when s = 1 then 'self' else 'relative' end
      from customers c
      cross join generate_series(1, ${SUBJECTS_PER_CUSTOMER}) as s
      where c.name like 'Stress #%'`;

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
      join customers c on c.id = sub.customer_id and c.name like 'Stress #%'
      cross join generate_series(1, ${MEASUREMENTS_PER_SUBJECT}) as m`;

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
      join customers c on c.id = sub.customer_id and c.name like 'Stress #%'
      cross join lateral (
        select id from measurements m where m.subject_id = sub.id order by random() limit 1
      ) mm
      cross join generate_series(1, ${JOBS_PER_SUBJECT}) as j`;

    await tx`
      insert into payments (job_id, amount, paid_at)
      select j.id,
             round((j.agreed_price / (2 + floor(random() * 4)))::numeric, 2),
             current_date - floor(random() * 1000)::int
      from jobs j
      join customers c on c.id = j.customer_id and c.name like 'Stress #%'
      cross join lateral (
        select g from generate_series(1, floor(random() * 4)::int) g
      ) as p`;
  });

  await sql`analyze customers, subjects, measurements, jobs, payments`;
  console.log("Planner statistics refreshed (ANALYZE).");
}

const [counts] = await sql<
  {
    stress_customers: string;
    subjects: string;
    measurements: string;
    jobs: string;
    payments: string;
  }[]
>`
  select
    (select count(*) from customers where name like 'Stress #%')::text as stress_customers,
    (select count(*) from subjects s join customers c on c.id = s.customer_id
      where c.name like 'Stress #%')::text as subjects,
    (select count(*) from measurements m
      join subjects s on s.id = m.subject_id
      join customers c on c.id = s.customer_id
      where c.name like 'Stress #%')::text as measurements,
    (select count(*) from jobs j join customers c on c.id = j.customer_id
      where c.name like 'Stress #%')::text as jobs,
    (select count(*) from payments p
      join jobs j on j.id = p.job_id
      join customers c on c.id = j.customer_id
      where c.name like 'Stress #%')::text as payments`;

console.log(`
Stress data ready:
  customers     ${counts?.stress_customers ?? "0"}
  subjects      ${counts?.subjects ?? "0"}
  measurements  ${counts?.measurements ?? "0"}
  jobs          ${counts?.jobs ?? "0"}
  payments      ${counts?.payments ?? "0"}

Your real data is untouched. When done experimenting, run:
  bun scripts/stress-cleanup.ts
`);

await sql.end();
