import { pg } from "../config/db";

interface MonthlyRevenueRow {
  month: Date;
  revenue: string;
  running_total: string;
}

export const monthlyRevenue = async () => {
  const rows = (await pg`
    with monthly_revenue as (
      select
        date_trunc('month', paid_at) as month,   
        sum(amount) as revenue
      from payments
      group by month
    )
    select
      month,
      revenue,
      sum(revenue) over (order by month asc) as running_total
    from monthly_revenue
    order by month asc
  `) as MonthlyRevenueRow[];

  return rows.map((row) => {
    const date = new Date(row.month);

    return {
      monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      month: date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      revenue: Number(row.revenue),
      runningTotal: Number(row.running_total),
    };
  });
};

interface TopCustomerRow {
  id: string;
  name: string;
  phone_number: string | null;
  total_paid: string;
  job_count: string;
}

export const topCustomers = async (limit: number) => {
  const rows = (await pg`
    select
      c.id,
      c.name,
      c.phone_number,
      sum(p.amount) as total_paid,
      count(distinct p.job_id) as job_count
    from payments p
    join jobs j on j.id = p.job_id     
    join customers c on c.id = j.customer_id  
    group by c.id
    order by total_paid desc
    limit ${limit}
  `) as TopCustomerRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phoneNumber: row.phone_number,
    totalPaid: Number(row.total_paid),
    jobCount: Number(row.job_count),
  }));
};

interface OutstandingPaymentRow {
  job_id: string;
  customer_id: string;
  customer_name: string;
  subject_name: string;
  description: string;
  status: string;
  due_date: Date | null;
  agreed_price: string;
  total_paid: string;
  balance_due: string;
}

export const outstandingPayments = async () => {
  const rows = (await pg`
    select
      j.id as job_id,
      c.id as customer_id,
      c.name as customer_name,
      s.name as subject_name,
      j.description,
      j.status,
      j.due_date,
      j.agreed_price,
      coalesce(sum(p.amount), 0) as total_paid,
      j.agreed_price - coalesce(sum(p.amount), 0) as balance_due
    from jobs j
    join customers c on c.id = j.customer_id
    join subjects s on s.id = j.subject_id
    left join payments p on p.job_id = j.id  
    group by j.id, c.id, s.id
    having j.agreed_price - coalesce(sum(p.amount), 0) > 0
    order by balance_due desc  
  `) as OutstandingPaymentRow[];

  return rows.map((row) => ({
    jobId: row.job_id,
    customer: { id: row.customer_id, name: row.customer_name },
    subjectName: row.subject_name,
    description: row.description,
    status: row.status,
    dueDate: row.due_date,
    agreedPrice: Number(row.agreed_price),
    totalPaid: Number(row.total_paid),
    balanceDue: Number(row.balance_due),
  }));
};
