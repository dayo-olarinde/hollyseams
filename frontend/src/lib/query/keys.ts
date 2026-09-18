/**
 * Every cache key in the app, in one place.
 *
 * Why centralise keys at all? Because invalidation is *prefix matching*, and prefix matching only
 * works if the nesting is consistent. The old hooks each declared their own keys, and one of them
 * broke the rule: `customerKeys.detail(id)` was `["customer", id]` — singular — while
 * `customerKeys.all` was `["customers"]`. Nothing that invalidated "all customers" could ever
 * reach a customer detail page, and nothing invalidated customers at all when a job created one,
 * so a brand-new client could be missing from the Clients tab for a full minute.
 *
 * The rule, enforced by the shape below: **a child key always starts with its parent's array.**
 * That makes `invalidateQueries({ queryKey: keys.jobs.all })` mean exactly what it says — every
 * job list, every job count and every job detail — with no second, easy-to-forget call.
 */
export const keys = {
  /** Whether the session cookie is still good. Deliberately not invalidated like data. */
  session: ["session"] as const,

  jobs: {
    all: ["jobs"] as const,
    /** Counts sit *under* `all` so a write refreshes the tab numbers and the lists together. */
    counts: ["jobs", "counts"] as const,
    list: (filter: string) => ["jobs", "list", filter] as const,
    lists: ["jobs", "list"] as const,
    detail: (id: string) => ["jobs", "detail", id] as const,
  },

  customers: {
    all: ["customers"] as const,
    list: ["customers", "list"] as const,
    /**
     * The one-shot list the new-job sheet searches. Deliberately *not* the infinite list's key:
     * an infinite query and a plain query must never share a key, because React Query identifies
     * a query by its key alone and would hand one the other's data shape.
     */
    picker: ["customers", "picker"] as const,
    detail: (id: string) => ["customers", "detail", id] as const,
    subjects: (id: string) => ["customers", "detail", id, "subjects"] as const,
    jobs: (id: string) => ["customers", "detail", id, "jobs"] as const,
  },

  subjects: {
    all: ["subjects"] as const,
    measurements: (subjectId: string) =>
      ["subjects", "detail", subjectId, "measurements"] as const,
  },

  reports: {
    all: ["reports"] as const,
    monthlyRevenue: ["reports", "monthly-revenue"] as const,
    outstandingPayments: ["reports", "outstanding-payments"] as const,
    topCustomers: (limit: number) =>
      ["reports", "top-customers", limit] as const,
  },
} as const;
