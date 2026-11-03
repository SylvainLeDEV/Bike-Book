import "server-only";
import { localDateOf } from "@/lib/format";
import { procedureNeeds } from "@/lib/procedures";
import { defaultLevelAfter } from "@/lib/runs";
import type {
  ProcedureVM,
  RunPartVM,
  RunProductVM,
  RunRef,
  RunRowVM,
  RunSummaryVM,
  RunVM,
} from "@/lib/view-models";
import {
  getRun,
  listAttachments,
  listMaintenanceEvents,
  listOpenTasks,
  listRules,
  type AccessContext,
  type Bike,
  type Run,
} from "@/server/db";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { attachmentUrl } from "./attachments";
import { getBikePage } from "./bikes";
import { procedureVMs } from "./procedures";
import { bikeRef } from "./refs";
import { loadGarage } from "./workshop";

// Runs ("suivi", D-82, D-87) as the screens show them: the run's own page, its summary, and the
// "En cours" of "À prévoir".

/** "En cours" on a task or a rule, from the runs in progress. */
export function runRefOf(runs: Run[], match: (run: Run) => boolean): RunRef | null {
  const run = runs.find(match);
  return run ? { id: run.id, status: run.status } : null;
}

/** Runs in progress started from a procedure alone: their own rows in "À prévoir". */
export function runRows(
  runs: (Run & { stepCount?: number; doneCount?: number })[],
  bikes: Bike[],
  timeZone: string,
): RunRowVM[] {
  return runs
    .filter((run) => run.taskId == null && run.ruleId == null)
    .map((run) => {
      const bike = bikes.find((b) => b.id === run.bikeId);
      return {
        id: run.id,
        title: run.title,
        bike: bike ? bikeRef(bike) : null,
        stepCount: run.stepCount ?? 0,
        doneCount: run.doneCount ?? 0,
        startedOn: localDateOf(run.startedAt, timeZone),
      };
    });
}

/** Everything the run's page shows, or null when the run is not in the workspace. */
export function getRunPage(ctx: AccessContext, runId: number): RunVM | null {
  const run = getRun(ctx, runId);
  if (!run) return null;
  const { timeZone } = getEnv();
  const garage = loadGarage(ctx);
  const bike = garage.bikes.find((b) => b.id === run.bikeId) ?? null;
  const procedure: ProcedureVM | null =
    run.procedureId == null
      ? null
      : (procedureVMs(
          garage.procedures.filter((p) => p.id === run.procedureId),
          garage.bikes,
          new Map(),
          [],
        )[0] ?? null);

  const context =
    run.taskId != null
      ? `Tâche : ${listOpenTasks(ctx).find((t) => t.id === run.taskId)?.title ?? run.title}`
      : run.ruleId != null && run.bikeId != null
        ? `Règle : ${listRules(ctx, run.bikeId).find((r) => r.id === run.ruleId)?.title ?? ""}`
        : null;

  const steps = run.steps.map((step) => ({
    id: step.id,
    instruction: step.instruction,
    note: step.note,
    torqueNm: step.torqueNm,
    done: step.doneAt != null,
    comment: step.comment,
    photoCount: step.photoCount,
    added: step.procedureStepId == null,
    // The procedure step's reference photos, while it exists (D-86).
    reference:
      step.procedureStepId == null
        ? []
        : (listAttachments(ctx, { kind: "procedure_step", id: step.procedureStepId }) ?? [])
            .filter((a) => a.kind === "photo" && a.mimeType.startsWith("image/"))
            .map((a) => ({
              thumbUrl: attachmentUrl(a.id, "thumb"),
              url: attachmentUrl(a.id, "display"),
              alt: a.caption ?? `Photo de référence : ${step.instruction}`,
            })),
  }));

  const event =
    run.maintenanceEventId != null && run.bikeId != null
      ? (listMaintenanceEvents(ctx, run.bikeId).find((e) => e.id === run.maintenanceEventId) ??
        null)
      : null;

  return {
    id: run.id,
    title: run.title,
    status: run.status,
    bike: bike ? bikeRef(bike) : null,
    context: context?.endsWith(": ") ? null : context,
    startedOn: localDateOf(run.startedAt, timeZone),
    procedure: procedure ? { id: procedure.id, title: procedure.title } : null,
    resources: procedure?.resources ?? [],
    lines: procedure?.lines ?? [],
    items: garage.items,
    steps,
    summary: run.status === "in_progress" ? summaryOf(ctx, run, procedure, garage.items) : null,
    event: event ? { id: event.id, bikeId: event.bikeId, performedOn: event.performedOn } : null,
    finishedOn: run.finishedAt == null ? null : localDateOf(run.finishedAt, timeZone),
  };
}

/**
 * What the summary proposes (D-87): the bike's parts and rules for the event's line (the part of
 * the procedure's type when it is the only one; the run's rule, else the one pointing to the
 * procedure, else the only active rule on the procedure's part type, D-100), the parts and
 * products of its material read for the bike, its duration. Parts and rules list the
 * procedure's part type first, each rule with its slot ("Frein arrière"): two "Purge des freins"
 * are told apart.
 */
function summaryOf(
  ctx: AccessContext,
  run: Run,
  procedure: ProcedureVM | null,
  items: ReturnType<typeof loadGarage>["items"],
): RunSummaryVM {
  const day = today();
  const laborMinutes = procedure?.estimatedDurationS
    ? Math.round(procedure.estimatedDurationS / 60)
    : null;
  const page = run.bikeId == null ? null : getBikePage(ctx, run.bikeId);
  if (!page || run.bikeId == null) {
    return {
      today: day,
      writesEvent: false,
      components: [],
      defaultComponentId: null,
      rules: [],
      defaultRuleId: null,
      parts: [],
      products: [],
      laborMinutes,
      replace: null,
    };
  }
  const slots = page.replace.slots;
  const typeCode = procedure?.componentTypeCode ?? null;
  const ofType = typeCode ? slots.filter((slot) => slot.componentTypeCode === typeCode) : [];
  // The bike's active rules (page.vm.rules, by urgency) and the part type each targets.
  const ruleTypes = new Map(listRules(ctx, run.bikeId).map((r) => [r.id, r.componentTypeCode]));
  const isOfType = (ruleId: number) => typeCode != null && ruleTypes.get(ruleId) === typeCode;
  const pointing =
    run.procedureId == null
      ? undefined
      : page.vm.rules.find((rule) => rule.procedure?.id === run.procedureId);
  const rulesOfType = page.vm.rules.filter((rule) => isOfType(rule.id));
  const defaultRuleId =
    run.ruleId ?? pointing?.id ?? (rulesOfType.length === 1 ? rulesOfType[0].id : null);
  const rank = (ruleId: number) => (ruleId === defaultRuleId ? 0 : isOfType(ruleId) ? 1 : 2);
  const rules = page.vm.rules
    .map((rule) => ({ id: rule.id, title: rule.title, slot: rule.slot?.typeLabel ?? null }))
    .sort((a, b) => rank(a.id) - rank(b.id));

  const parts = new Map<number, RunPartVM>();
  const products = new Map<number, RunProductVM>();
  for (const need of procedureNeeds(procedure?.lines ?? [], items, run.bikeId)) {
    const item = need.item;
    if (item?.kind === "part" && item.quantity > 0 && !parts.has(item.id)) {
      parts.set(item.id, {
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        inStock: item.quantity,
        defaultQuantity: Math.min(need.quantity ?? 1, item.quantity),
        lastUnitCostCents: item.lastUnitCostCents,
      });
    }
    if (item?.kind === "product" && item.containers > 0 && !products.has(item.id)) {
      products.set(item.id, {
        itemId: item.id,
        name: item.name,
        container: item.container,
        containers: item.containers,
        level: item.level,
        defaultLevel: defaultLevelAfter(item.level),
      });
    }
  }

  return {
    today: day,
    writesEvent: true,
    components: [...ofType, ...slots.filter((slot) => !ofType.includes(slot))].map((slot) => ({
      id: slot.componentId,
      label: `${slot.label} · ${slot.fitted.model}`,
    })),
    defaultComponentId: ofType.length === 1 ? ofType[0].componentId : null,
    rules,
    defaultRuleId,
    parts: [...parts.values()],
    products: [...products.values()],
    laborMinutes,
    replace: page.replace,
  };
}
