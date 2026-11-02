import "server-only";
import type { ComponentTypeCode } from "@/lib/enums";
import { COMPONENT_TYPE_LABELS } from "@/lib/labels";
import type { BikeRef, ProcedureOption, ProcedureRef, ProcedureVM } from "@/lib/view-models";
import type { Bike, Procedure, Run, Task } from "@/server/db";
import { bikeRef } from "./refs";
import type { EvaluatedRule } from "./rules";

// Maintenance procedures ("fiches", D-86) as the screens show them: the workshop's "Fiches" tab,
// the bike page's section, the "Fiche : …" line of "À prévoir" and the sheets' choices.

const typeLabel = (code: string) => COMPONENT_TYPE_LABELS[code as ComponentTypeCode] ?? code;

/** "Fiche : …" on a rule or task row; null without a procedure. */
export function procedureRefOf(
  procedureId: number | null,
  procedures: Pick<Procedure, "id" | "title">[],
): ProcedureRef | null {
  if (procedureId == null) return null;
  const found = procedures.find((p) => p.id === procedureId);
  return found ? { id: found.id, title: found.title } : null;
}

/** What a rule or a task can point to: the procedures not archived. */
export function procedureOptions(procedures: Procedure[]): ProcedureOption[] {
  return procedures
    .filter((p) => p.archivedAt == null)
    .map((p): ProcedureOption => ({
      id: p.id,
      title: p.title,
      bikeIds: p.allBikes ? "all" : p.bikeIds,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));
}

/** Every procedure of the workspace with its lists and the rules and open tasks that use it. */
export function procedureVMs(
  procedures: Procedure[],
  bikes: Bike[],
  rules: Map<number, EvaluatedRule[]>,
  openTasks: Task[],
  runs: Run[] = [],
): ProcedureVM[] {
  const refs = new Map(bikes.map((bike) => [bike.id, bikeRef(bike)]));
  const evaluated = [...rules.values()].flat();
  return procedures.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    componentTypeCode: p.componentTypeCode,
    typeLabel: p.componentTypeCode ? typeLabel(p.componentTypeCode) : null,
    modelHint: p.modelHint,
    bikes: p.allBikes
      ? "all"
      : p.bikeIds.flatMap((id) => (refs.has(id) ? [refs.get(id) as BikeRef] : [])),
    estimatedDurationS: p.estimatedDurationS,
    difficulty: p.difficulty,
    archived: p.archivedAt != null,
    steps: p.steps,
    lines: p.items.map((item) =>
      item.inventoryItemId != null
        ? { id: item.id, quantity: item.quantity, target: "item", itemId: item.inventoryItemId }
        : item.componentTypeCode != null
          ? {
              id: item.id,
              quantity: item.quantity,
              target: "type",
              componentTypeCode: item.componentTypeCode,
              typeLabel: typeLabel(item.componentTypeCode),
            }
          : { id: item.id, quantity: item.quantity, target: "label", label: item.label ?? "" },
    ),
    resources: p.resources,
    runs: runs
      .filter((run) => run.procedureId === p.id && run.taskId == null && run.ruleId == null)
      .map((run) => ({ id: run.id, bikeId: run.bikeId })),
    links: [
      ...evaluated
        .filter((entry) => entry.rule.procedureId === p.id)
        .map((entry) => ({
          kind: "rule" as const,
          id: entry.rule.id,
          bike: entry.row.bike,
          title: entry.rule.title,
          status: entry.row.status,
        })),
      ...openTasks
        .filter((task) => task.procedureId === p.id)
        .map((task) => ({
          kind: "task" as const,
          id: task.id,
          bike: task.bikeId == null ? null : (refs.get(task.bikeId) ?? null),
          title: task.title,
          status: null,
        })),
    ],
  }));
}
