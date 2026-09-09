/**
 * Stress cleanup — removes every row created by scripts/stress-seed.ts,
 * leaving real data untouched.
 *
 * Safety: deletes follow the FK lineage downward from stress customers
 * (payments -> jobs -> measurements -> subjects -> customers), so a stress
 * row can only be removed if it genuinely belongs to a stress customer.
 * Your real rows share no lineage with them. Payments are deleted before
 * jobs because jobs have an onDelete: "restrict" FK from payments.
 *
 * One transaction: either every stress row goes, or (on any failure) the
 * database is left exactly as it was.
 *
 * Run: bun scripts/stress-cleanup.ts
 */
import postgres from "postgres";
import { env } from "../src/config/env";

const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });

const [before] = await sql<
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

console.log(`Stress rows found:
  customers     ${before?.stress_customers ?? "0"}
  subjects      ${before?.subjects ?? "0"}
  measurements  ${before?.measurements ?? "0"}
  jobs          ${before?.jobs ?? "0"}
  payments      ${before?.payments ?? "0"}`);

await sql.begin(async (tx) => {
  await tx`
    delete from payments p
    using jobs j
    join customers c on c.id = j.customer_id
    where p.job_id = j.id and c.name like 'Stress #%'`;

  await tx`
    delete from jobs j
    using customers c
    where j.customer_id = c.id and c.name like 'Stress #%'`;

  await tx`
    delete from measurements m
    using subjects s
    join customers c on c.id = s.customer_id
    where m.subject_id = s.id and c.name like 'Stress #%'`;

  await tx`
    delete from subjects s
    using customers c
    where s.customer_id = c.id and c.name like 'Stress #%'`;

  await tx`
    delete from customers where name like 'Stress #%'`;
});

await sql`analyze customers, subjects, measurements, jobs, payments`;

const [after] = await sql<
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
After cleanup:
  customers     ${after?.stress_customers ?? "0"}
  subjects      ${after?.subjects ?? "0"}
  measurements  ${after?.measurements ?? "0"}
  jobs          ${after?.jobs ?? "0"}
  payments      ${after?.payments ?? "0"}

All zero above means your database is back to exactly your own data.
`);

await sql.end();
