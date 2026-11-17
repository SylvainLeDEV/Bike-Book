import type { RuleStatus } from "./enums";
import { daysBetween, type LocalDate } from "./format";
import type { RuleRowVM, TaskRowVM } from "./view-models";

/** A dated task is "due soon" from this many days before its day (D-108). */
export const TASK_DUE_SOON_DAYS = 7;

/** A task's place among the rules (D-108): its due date read as a rule status; null when undated. */
export type TaskStatus = Exclude<RuleStatus, "snoozed"> | null;

/**
 * Overdue once its day has passed ("Avant le 17 novembre" is still on time on the 17th), due soon
 * from TASK_DUE_SOON_DAYS days before, up to date before that.
 */
export function taskStatus(dueOn: LocalDate | null, today: LocalDate): TaskStatus {
  if (!dueOn) return null;
  const daysLeft = daysBetween(today, dueOn);
  if (daysLeft < 0) return "overdue";
  return daysLeft <= TASK_DUE_SOON_DAYS ? "due_soon" : "ok";
}

export type PlanEntry =
  { kind: "rule"; rule: RuleRowVM } | { kind: "task"; task: TaskRowVM; status: TaskStatus };

const RANK: Record<RuleStatus | "undated", number> = {
  overdue: 0,
  due_soon: 1,
  snoozed: 2,
  ok: 3,
  undated: 4,
};

/**
 * "À prévoir" as one list (D-108): overdue, due soon, snoozed, up to date, then undated tasks.
 * Within a status, rules come first in their given order (most urgent first), then tasks in
 * theirs (by due date).
 */
export function planEntries(rules: RuleRowVM[], tasks: TaskRowVM[], today: LocalDate): PlanEntry[] {
  const entries: PlanEntry[] = [
    ...rules.map((rule) => ({ kind: "rule" as const, rule })),
    ...tasks.map((task) => ({
      kind: "task" as const,
      task,
      status: taskStatus(task.dueOn, today),
    })),
  ];
  const rank = (entry: PlanEntry) =>
    RANK[entry.kind === "rule" ? entry.rule.status : (entry.status ?? "undated")];
  // Array.prototype.sort is stable: equal ranks keep the order above.
  return entries.sort((a, b) => rank(a) - rank(b));
}
