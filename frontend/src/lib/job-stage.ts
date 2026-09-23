import type { Job } from "@/types/job";
import {
  formatDay,
  formatStampDay,
  isOverdue,
  parseDay,
  startOfToday,
} from "./format";

/**
 * The stage chip, the due line and the status phrase — one shape per job state.
 *
 * Both the jobs-list card and the order file render the *same* job state in three places (chip,
 * timeline line, indicator phrase). This module is the one source of truth for that rendering, so
 * the list and the detail page can never disagree about what "ready" looks like.
 */
export function jobStage(job: Job): {
  chip: string;
  label: string;
  phrase: string;
  due: string;
  dueTone: string;
  pillActive: string;
} {
  const overdue = isOverdue(job);
  if (job.status === "canceled") {
    return {
      chip: "bg-(--hig-separator) text-(--hig-label-secondary)",
      label: "Canceled",
      phrase: "Closed without delivery",
      due: "—",
      dueTone: "text-(--hig-label-tertiary)",
      pillActive: "border-(--hig-separator) text-(--hig-label-secondary)",
    };
  }
  if (overdue) {
    return {
      chip: "bg-(--hig-danger-tint) text-(--hig-danger)",
      label: "Overdue",
      phrase: "Past due — chase this one",
      due: "Was due " + formatDay(job.dueDate),
      dueTone: "text-(--hig-danger)",
      pillActive: "border-(--hig-danger) text-(--hig-danger)",
    };
  }
  if (job.status === "pending") {
    return {
      chip: "bg-(--hig-warning-tint) text-(--hig-warning)",
      label: "In progress",
      phrase: "Active in the workshop",
      due: job.dueDate ? "Due " + formatDay(job.dueDate) : "No due date",
      dueTone: "text-(--hig-label-secondary)",
      pillActive: "border-(--hig-warning) text-(--hig-warning)",
    };
  }
  if (job.status === "completed" && !job.deliveredAt) {
    return {
      chip: "bg-(--hig-success-tint) text-(--hig-success)",
      label: "Fitting done",
      phrase: "Ready for pickup",
      due: "Waiting on customer",
      dueTone: "text-(--hig-success)",
      pillActive: "border-(--hig-success) text-(--hig-success)",
    };
  }
  return {
    chip: "bg-(--hig-accent-tint) text-(--hig-accent)",
    label: "Delivered",
    phrase: "Handed to client",
    due: "Collected " + formatStampDay(job.deliveredAt),
    dueTone: "text-(--hig-accent)",
    pillActive: "border-(--hig-accent) text-(--hig-accent)",
  };
}

/**
 * The hero card's countdown pill: "In 9 days", "Due today", "3 days late".
 *
 * A countdown only means something while the garment is still on the bench — a delivered job's
 * deadline is history, and a canceled one never had a future — so those return `null` and the
 * pill simply doesn't render.
 */
export function dueCountdown(
  job: Job,
): { text: string; late: boolean } | null {
  if (job.status !== "pending" || !job.dueDate) return null;
  const due = parseDay(job.dueDate);
  if (!Number.isFinite(due)) return null;

  const days = Math.round((due - startOfToday()) / 86_400_000);
  if (days > 1) return { text: `In ${days} days`, late: false };
  if (days === 1) return { text: "Tomorrow", late: false };
  if (days === 0) return { text: "Due today", late: false };
  if (days === -1) return { text: "1 day late", late: true };
  return { text: `${Math.abs(days)} days late`, late: true };
}
