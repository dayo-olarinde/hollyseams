/**
 * Formatting, once.
 *
 * These helpers existed in five or six near-identical copies — `initials` in five files, `naira` in
 * five, `parseDay` in four, `formatDay`/`fmtDay`/`formatDueDate` in five — because each page was
 * built on its own. That is how a bug becomes two bugs: one file gets the fix and the others keep
 * the old behaviour, and nobody can tell which is authoritative by reading a diff.
 *
 * `Intl` objects are also *not* free to construct — `new Intl.NumberFormat(...)` is one of the more
 * expensive things in a JS bundle's startup path. Six copies of it meant six constructions on every
 * page load. Module scope means one, reused.
 */
const nairaFormat = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** `₦120,000`. The currency formatter without the symbol is used where the design prints ₦ itself. */
export const naira = (amount: number): string => nairaFormat.format(amount);

/**
 * Centimetres for a stored inch value, one decimal place: 36 → "91.4".
 *
 * The studio measures in inches — every number in the database was taken with an inch tape — but
 * Stitch's measurement tables print the metric twin in brackets beside each figure, so the book
 * shows `36″ (91.4 cm)`. Rounded to 0.1cm; a half-inch is 1.27cm, so anything coarser silently
 * lies about the fit.
 */
export const cmOf = (inches: number): string =>
  (Math.round(inches * 2.54 * 10) / 10).toString();

/**
 * `"5 Mar"` from a date or a date-prefixed timestamp.
 *
 * The regex path is not redundant: the API sends `dueDate` as `YYYY-MM-DD`, which `new Date()`
 * reads as **UTC midnight** — so on any machine west of Greenwich, `new Date("2026-03-05")` is
 * March 4th locally, and a job due today would render as due yesterday. Reading the parts
 * literally keeps a calendar date a calendar date. Timestamps without a date prefix fall back to
 * `Date`, which is correct for real instants.
 */
export function formatDay(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${+m[3]!} ${MONTHS[+m[2]! - 1]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** A server timestamp (`createdAt`, `deliveredAt`) read in UTC — the instant the server recorded. */
export function formatStampDay(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** `"Mar 2026"` from the reports' `YYYY-MM` bucket key. */
export function formatMonthKey(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(monthKey);
  if (!m) return monthKey;
  return `${MONTHS[+m[2]! - 1]} ${m[1]}`;
}

/** `"MAR"` — the chart's axis label, which is deliberately narrower than the table's. */
export function monthShort(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(monthKey);
  if (!m) return monthKey;
  return MONTHS[+m[2]! - 1]!.toUpperCase();
}

/** Local midnight of a date string, in ms. `NaN` when the value is unusable. */
export function parseDay(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!).getTime();

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return NaN;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Today at local midnight. Overdue is a calendar question, not an instant one. */
export const startOfToday = (): number =>
  new Date(new Date().toDateString()).getTime();

/**
 * "Late" means: still open, has a due date, and that date is behind us.
 *
 * One definition, because four screens ask this question and only one of them should own the
 * answer. Cancelled and delivered jobs are never overdue no matter how old the date is.
 */
export function isOverdue(job: {
  status: string;
  dueDate: string | null;
}): boolean {
  if (job.status !== "pending" || !job.dueDate) return false;
  const due = parseDay(job.dueDate);
  return Number.isFinite(due) && due < startOfToday();
}

/**
 * `"AO"` for "Ada Obi", skipping honorifics so "Mrs Ada Obi" is not "MA".
 *
 * The `•` fallback is the design's: an avatar with no letters should look intentionally empty
 * rather than broken.
 */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((word) => !/^(mrs|mr|ms|dr)\.?$/i.test(word))
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "•"
  );
}

/** The date line every tab header shows: `"Monday, 5 March"`. */
export function todayLine(now = new Date()): string {
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** The dashboard's greeting, from the hour the user actually opened the app. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
}

/** Today as `YYYY-MM-DD`, for `<input type="date">` values and measurement dates. */
export const todayISO = (): string => new Date().toISOString().slice(0, 10);
