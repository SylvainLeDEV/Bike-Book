import { describe, expect, it } from "vitest";
import type { RuleStatus } from "./enums";
import { planEntries, taskStatus } from "./plan";
import type { RuleRowVM, TaskRowVM } from "./view-models";

const today = "2026-11-17";

// Only the fields the order reads; the rest of a row does not matter here.
const rule = (id: number, status: RuleStatus) => ({ id, status }) as RuleRowVM;
const task = (id: number, dueOn: string | null) => ({ id, dueOn }) as TaskRowVM;

const order = (rules: RuleRowVM[], tasks: TaskRowVM[]) =>
  planEntries(rules, tasks, today).map(
    (e) => `${e.kind === "rule" ? "r" : "t"}${e.kind === "rule" ? e.rule.id : e.task.id}`,
  );

describe("task status (D-108)", () => {
  it("is overdue once its day has passed, on time on the day itself", () => {
    expect(taskStatus("2026-11-16", today)).toBe("overdue");
    expect(taskStatus("2026-11-17", today)).toBe("due_soon");
  });

  it("is due soon up to 7 days before, up to date before that", () => {
    expect(taskStatus("2026-11-24", today)).toBe("due_soon");
    expect(taskStatus("2026-11-25", today)).toBe("ok");
  });

  it("has no status without a due date", () => {
    expect(taskStatus(null, today)).toBeNull();
  });
});

describe('"À prévoir" order (D-108)', () => {
  it("puts an overdue task above up-to-date rules", () => {
    expect(order([rule(1, "ok")], [task(1, "2026-11-10")])).toEqual(["t1", "r1"]);
  });

  it("orders by status, rules before tasks within one, undated tasks last", () => {
    const rules = [rule(1, "overdue"), rule(2, "due_soon"), rule(3, "snoozed"), rule(4, "ok")];
    const tasks = [
      task(1, "2026-11-01"),
      task(2, "2026-11-20"),
      task(3, "2026-12-15"),
      task(4, null),
    ];
    expect(order(rules, tasks)).toEqual(["r1", "t1", "r2", "t2", "r3", "r4", "t3", "t4"]);
  });

  it("keeps the given order within a status", () => {
    const rules = [rule(5, "overdue"), rule(2, "overdue")];
    const tasks = [task(7, "2026-11-01"), task(3, "2026-11-05")];
    expect(order(rules, tasks)).toEqual(["r5", "r2", "t7", "t3"]);
  });
});
