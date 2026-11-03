import "server-only";
import { z } from "zod";
import { formatItemStock } from "@/lib/display";
import { MAINTENANCE_LINE_ACTIONS, PRODUCT_LEVELS } from "@/lib/enums";
import { procedureNeeds } from "@/lib/procedures";
import { partsCostCents, uncheckedSteps, uncheckedText } from "@/lib/runs";
import type { RunVM } from "@/lib/view-models";
import { finishRunSchema, parseFinishRun } from "@/server/actions/run-input";
import {
  abandonRun,
  atomically,
  finishRun,
  getRun,
  listAttachments,
  listRules,
  previewWrite,
  startRun,
  updateRunStep,
  type AccessContext,
  type StartRunInput,
} from "@/server/db";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { getRunPage } from "@/server/views/runs";
import { loadGarage } from "@/server/views/workshop";
import { bikeUrl, describeRule, evaluateRules, type Ids } from "../describe";
import {
  answer,
  defineTool,
  dryRunInput,
  fieldErrorsOf,
  logWrite,
  refused,
  ToolRefusal,
  type FieldError,
} from "../tool";
import { describeNeed } from "./procedures";

// Runs ("suivi", D-82, D-87) through the MCP (D-98): start one from a task, a rule or a
// procedure for a bike, follow its steps, and "Terminer": the maintenance event, the parts and
// product levels taken from the workshop, the rule reset and the task done, in one transaction.
// The run's screen proposes the summary (getRunPage); the tools propose the same.

const REFUSED = "The run was refused; nothing was written.";

function runUrl(runId: number): string {
  return `${getEnv().publicUrl}/runs/${runId}`;
}

/** A run as its screen shows it: steps, material for its bike, and the summary it proposes. */
function describeRun(vm: RunVM, ids: Ids) {
  const real = ids === "real";
  const summary = vm.summary;
  const unchecked = uncheckedSteps(vm.steps);
  return {
    id: real ? vm.id : null,
    title: vm.title,
    status: vm.status,
    bike: vm.bike ? { id: vm.bike.id, name: vm.bike.name } : null,
    context: vm.context,
    started_on: vm.startedOn,
    procedure: vm.procedure,
    steps: vm.steps.map((step, index) => ({
      id: real ? step.id : null,
      number: index + 1,
      instruction: step.instruction,
      note: step.note,
      torque_nm: step.torqueNm,
      done: step.done,
      comment: step.comment,
      added_along_the_way: step.added,
    })),
    unchecked_steps: unchecked,
    material: procedureNeeds(vm.lines, vm.items, vm.bike?.id ?? null).map(describeNeed),
    resources: vm.resources.map((r) => ({
      kind: r.kind,
      title: r.title,
      url: r.url,
      body: r.body,
    })),
    /** What "Terminer" proposes; finish_run takes these unless told otherwise. */
    summary: summary
      ? {
          writes_event: summary.writesEvent,
          components: summary.components,
          default_component_id: summary.defaultComponentId,
          rules: summary.rules,
          default_rule_id: summary.defaultRuleId,
          parts: summary.parts.map((part) => ({
            item_id: part.itemId,
            name: part.name,
            in_stock: part.inStock,
            default_quantity: part.defaultQuantity,
            last_unit_cost_cents: part.lastUnitCostCents,
          })),
          products: summary.products.map((product) => ({
            item_id: product.itemId,
            name: product.name,
            level: product.level,
            default_level_after: product.defaultLevel,
          })),
          labor_time_s: summary.laborMinutes == null ? null : summary.laborMinutes * 60,
        }
      : null,
    event: vm.event,
    finished_on: vm.finishedOn,
    url: real ? runUrl(vm.id) : null,
  };
}

const runPage = (ctx: AccessContext, runId: number) => getRunPage(ctx, runId);

const notFound = () =>
  refused([{ field: "run_id", message: "Suivi introuvable." }], "Unknown run.");

// --- start_run and get_run -----------------------------------------------------------------------

const startRunTool = defineTool({
  name: "start_run",
  title: "Commencer un suivi",
  kind: "write",
  description:
    'Starts a run ("suivi") of a maintenance, as "Commencer": from an open task (task_id), a rule that has a procedure (rule_id), or a procedure for a bike (procedure_id and bike_id). The procedure\'s steps are copied; a run already in progress for the same task, rule, or procedure and bike is resumed instead. The answer gives the steps to follow, the material read against the workshop, and what "Terminer" will propose. Call with dry_run true first.',
  input: z.strictObject({
    task_id: z.number().optional().describe("An open task (list_due_work)."),
    rule_id: z.number().optional().describe("A rule with a procedure (list_due_work)."),
    procedure_id: z.number().optional().describe("A procedure (list_procedures), with bike_id."),
    bike_id: z.number().optional().describe("With procedure_id: the bike it is done on."),
    dry_run: dryRunInput,
  }),
  run: (
    ctx,
    {
      task_id: taskId,
      rule_id: ruleId,
      procedure_id: procedureId,
      bike_id: bikeId,
      dry_run: dryRun,
    },
  ) => {
    const given = [taskId != null, ruleId != null, procedureId != null].filter(Boolean).length;
    if (given !== 1 || (procedureId != null) !== (bikeId != null)) {
      return refused(
        [
          {
            field: "input",
            message: "Indique une tâche, une règle, ou une fiche avec son vélo.",
          },
        ],
        REFUSED,
      );
    }
    const input: StartRunInput =
      taskId != null
        ? { from: "task", taskId }
        : ruleId != null
          ? { from: "rule", ruleId }
          : { from: "procedure", procedureId: procedureId!, bikeId: bikeId! };
    const ids: Ids = dryRun ? "none" : "real";
    const write = () => {
      const outcome = startRun(ctx, input, Date.now());
      if (!outcome.ok) {
        throw new ToolRefusal(
          [
            {
              field: taskId != null ? "task_id" : ruleId != null ? "rule_id" : "procedure_id",
              message:
                ruleId != null
                  ? "Règle introuvable, ou sans fiche : ajoute-lui une fiche d'abord."
                  : "Tâche, fiche ou vélo introuvable.",
            },
          ],
          REFUSED,
        );
      }
      return {
        runId: outcome.runId,
        resumed: outcome.resumed,
        run: describeRun(runPage(ctx, outcome.runId)!, outcome.resumed ? "real" : ids),
      };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun && !result.resumed) logWrite(ctx, "start_run", { run_id: result.runId });
    return answer(
      result.resumed
        ? `A run of this is already in progress (run ${result.runId}): resumed.`
        : dryRun
          ? `Dry run: would start "${result.run.title}" (${result.run.steps.length} steps). Nothing was written.`
          : `Started "${result.run.title}" (run ${result.runId}).`,
      { dry_run: dryRun, resumed: result.resumed, run: result.run, warnings: [] },
    );
  },
});

const getRunTool = defineTool({
  name: "get_run",
  title: "Un suivi",
  kind: "read",
  description:
    'A run ("suivi"): its steps (done or not, comments), the material read against the workshop for its bike, its resources, and while in progress what "Terminer" proposes (the part and rule of the event\'s line, the parts and product levels taken, the time). The runs in progress are in list_due_work.',
  input: z.strictObject({ run_id: z.number().describe("The run (start_run, list_due_work).") }),
  run: (ctx, { run_id: runId }) => {
    const vm = runPage(ctx, runId);
    if (!vm) return notFound();
    return answer(`Run "${vm.title}" (${vm.status}).`, { run: describeRun(vm, "real") });
  },
});

// --- update_run_steps ----------------------------------------------------------------------------

const updateRunStepsTool = defineTool({
  name: "update_run_steps",
  title: "Étapes d'un suivi",
  kind: "write",
  description:
    'Checks the steps of a run in progress as the owner does them ("Étape faite"), and keeps their comments ("serré à 6 N·m", "joint changé"). Each step: done (true or false), comment (null clears it). Guide the owner one step at a time and check each as they say it is done. Call with dry_run true first.',
  input: z.strictObject({
    run_id: z.number().describe("The run (start_run)."),
    steps: z
      .array(
        z.strictObject({
          step_id: z.number().describe("A step of the run (get_run)."),
          done: z.boolean().optional(),
          comment: z.string().nullable().optional(),
        }),
      )
      .min(1)
      .max(60),
    dry_run: dryRunInput,
  }),
  run: (ctx, { run_id: runId, steps, dry_run: dryRun }) => {
    const run = getRun(ctx, runId);
    if (!run) return notFound();
    if (run.status !== "in_progress") {
      return refused([{ field: "run_id", message: "Ce suivi est terminé." }], REFUSED);
    }
    const stepIds = new Set(run.steps.map((step) => step.id));
    const errors: FieldError[] = steps.flatMap((step, index) => {
      if (!stepIds.has(step.step_id)) {
        return [{ field: `steps[${index}].step_id`, message: "Étape introuvable sur ce suivi." }];
      }
      if (step.done === undefined && step.comment === undefined) {
        return [{ field: `steps[${index}]`, message: "Rien à changer." }];
      }
      if (step.comment != null && step.comment.trim().length > 1000) {
        return [{ field: `steps[${index}].comment`, message: "1000 caractères au maximum." }];
      }
      return [];
    });
    if (errors.length) return refused(errors, REFUSED);
    const write = () => {
      const at = Date.now();
      for (const step of steps) {
        const patch = {
          ...(step.done === undefined ? {} : { done: step.done }),
          ...(step.comment === undefined ? {} : { comment: step.comment?.trim() || null }),
        };
        if (!updateRunStep(ctx, step.step_id, patch, at).ok) {
          throw new ToolRefusal([{ field: "run_id", message: "Ce suivi est terminé." }], REFUSED);
        }
      }
      return describeRun(runPage(ctx, runId)!, "real");
    };
    const after = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "update_run_steps", { run_id: runId });
    const left = after.unchecked_steps.length;
    return answer(
      `${dryRun ? "Dry run: " : ""}${after.steps.length - left} of ${after.steps.length} steps done.${dryRun ? " Nothing was written." : ""}`,
      { dry_run: dryRun, run: after, warnings: [] },
    );
  },
});

// --- finish_run ----------------------------------------------------------------------------------

const finishRunTool = defineTool({
  name: "finish_run",
  title: "Terminer un suivi",
  kind: "write",
  description:
    "Finishes a run, as \"Terminer\" then \"Enregistrer l'entretien\", in one transaction: a maintenance event (day, title, notes, time spent) with one line (action, part, the rule it fulfils: its counter restarts), the parts taken from the workshop (units) and the products' open container after the job (level), the task done. Every field left out takes what get_run's summary proposes (parts at their default quantity, products one level down, the cost of the parts taken); parts: [] or products: [] take none. A general task's run writes no event: the task is done. join_event_id adds the line to an event of the same bike and day (a replacement made for the job, replace_component). Unchecked steps are warned about, never blocking. Undo: delete_maintenance on its event gives the stock back. Call with dry_run true first.",
  input: z.strictObject({
    run_id: z.number().describe("The run (start_run, list_due_work)."),
    performed_on: z.string().optional().describe("YYYY-MM-DD, not in the future (default today)."),
    title: z.string().optional().describe("Default: the run's title."),
    notes: z.string().nullable().optional(),
    labor_time_s: z
      .number()
      .nullable()
      .optional()
      .describe("Time spent, seconds, rounded to the minute (default: the procedure's duration)."),
    action: z.enum(MAINTENANCE_LINE_ACTIONS).optional().describe("Default serviced."),
    component_id: z
      .number()
      .nullable()
      .optional()
      .describe("The part worked on (get_run's summary)."),
    rule_id: z.number().nullable().optional().describe("The rule fulfilled (get_run's summary)."),
    cost_cents: z
      .number()
      .nullable()
      .optional()
      .describe("Default: the parts taken, at their last purchase price."),
    join_event_id: z.number().nullable().optional(),
    parts: z
      .array(z.strictObject({ item_id: z.number(), quantity: z.number() }))
      .optional()
      .describe("Workshop parts taken out of the stock, in units."),
    products: z
      .array(
        z.strictObject({
          item_id: z.number(),
          level_after: z.enum(PRODUCT_LEVELS).describe("full, started, low, or empty (finished)."),
        }),
      )
      .optional()
      .describe("Products used: their open container's level after the job."),
    save_as_procedure: z
      .boolean()
      .optional()
      .describe("A run without procedure: its steps become a new procedure (default false)."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { run_id: runId, dry_run: dryRun, ...args }) => {
    const vm = runPage(ctx, runId);
    if (!vm) return notFound();
    if (vm.status !== "in_progress" || !vm.summary) {
      return refused([{ field: "run_id", message: "Ce suivi est déjà terminé." }], REFUSED);
    }
    const summary = vm.summary;
    const parts =
      args.parts?.map((p) => ({ itemId: p.item_id, quantity: p.quantity })) ??
      summary.parts.map((p) => ({ itemId: p.itemId, quantity: p.defaultQuantity }));
    const products =
      args.products?.map((p) => ({ itemId: p.item_id, levelAfter: p.level_after })) ??
      summary.products.map((p) => ({ itemId: p.itemId, levelAfter: p.defaultLevel }));
    const quantities = Object.fromEntries(parts.map((p) => [p.itemId, p.quantity]));
    const pick = <T>(value: T | undefined, fallback: T) => (value === undefined ? fallback : value);
    const input = {
      performedOn: args.performed_on ?? today(),
      title: args.title ?? vm.title,
      notes: args.notes ?? null,
      laborMinutes:
        args.labor_time_s === undefined
          ? summary.laborMinutes
          : args.labor_time_s == null
            ? null
            : Math.round(args.labor_time_s / 60),
      action: args.action ?? "serviced",
      componentId: pick(args.component_id, summary.defaultComponentId),
      ruleId: pick(args.rule_id, summary.defaultRuleId),
      costCents: pick(args.cost_cents, partsCostCents(summary.parts, quantities)),
      joinEventId: args.join_event_id ?? null,
      parts,
      products,
      saveAsProcedure: args.save_as_procedure ?? false,
    };
    const checked = finishRunSchema(today()).safeParse(input);
    if (!checked.success) {
      return refused(
        fieldErrorsOf(checked.error.issues, "", {
          laborMinutes: "labor_time_s",
          itemId: "item_id",
          levelAfter: "level_after",
        }),
        REFUSED,
      );
    }
    const parsed = parseFinishRun(input, today(), summary.writesEvent, Date.now());
    if (!parsed.ok) return refused([{ field: "input", message: parsed.error }], REFUSED);
    const data = parsed.data;
    const items = new Map(loadGarage(ctx).items.map((item) => [item.id, item]));
    const rules = vm.bike ? new Map(listRules(ctx, vm.bike.id).map((r) => [r.id, r])) : new Map();
    const ids: Ids = dryRun ? "none" : "real";
    const write = () => {
      const outcome = finishRun(ctx, runId, data);
      if (!outcome.ok) {
        const message = {
          not_found: "Suivi introuvable.",
          invalid: "Pièce, règle ou objet de l'atelier introuvable.",
          stock: "Il n'y a pas assez de stock pour une des pièces : baisse la quantité.",
        }[outcome.reason];
        throw new ToolRefusal(
          [{ field: outcome.reason === "stock" ? "parts" : "input", message }],
          REFUSED,
        );
      }
      const garage = loadGarage(ctx);
      const used = [...parts.map((p) => p.itemId), ...products.map((p) => p.itemId)];
      const evaluations = vm.bike ? evaluateRules(ctx, vm.bike.id) : new Map();
      return {
        outcome,
        stock: [...new Set(used)].flatMap((id) => {
          const item = garage.items.find((i) => i.id === id);
          return item
            ? [
                {
                  item_id: id,
                  name: item.name,
                  stock_before: items.get(id) ? formatItemStock(items.get(id)!) : null,
                  stock_after: formatItemStock(item),
                  rebuy_state: item.state,
                },
              ]
            : [];
        }),
        rule:
          data.line?.ruleId != null && rules.has(data.line.ruleId)
            ? describeRule(rules.get(data.line.ruleId)!, "real", evaluations.get(data.line.ruleId))
            : null,
      };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) {
      logWrite(ctx, "finish_run", { run_id: runId, event_id: result.outcome.eventId });
    }
    const unchecked = uncheckedText(uncheckedSteps(vm.steps));
    const toRebuy = result.stock.filter((s) => s.rebuy_state === "low_stock");
    return answer(
      dryRun
        ? `Dry run: would finish "${data.title}" on ${data.performedOn}. Nothing was written.`
        : `Finished "${data.title}"${result.outcome.eventId ? ` (event ${result.outcome.eventId})` : ""}.`,
      {
        dry_run: dryRun,
        event_id: ids === "real" ? result.outcome.eventId : null,
        line: data.line
          ? {
              action: data.line.action,
              component_id: data.line.componentId,
              rule_id: data.line.ruleId,
              cost_cents: data.line.costCents,
            }
          : null,
        stock: result.stock,
        rule_restarted: result.rule,
        warnings: [
          ...(unchecked ? [`${unchecked} (unchecked steps never block)`] : []),
          ...toRebuy.map(
            (s) => `"${s.name}" reaches its low stock: set_restock puts it on the list.`,
          ),
        ],
        url: vm.bike
          ? ids === "real" && result.outcome.eventId
            ? `${bikeUrl(vm.bike.id)}?event=${result.outcome.eventId}`
            : bikeUrl(vm.bike.id)
          : null,
      },
    );
  },
});

// --- abandon_run ---------------------------------------------------------------------------------

const abandonRunTool = defineTool({
  name: "abandon_run",
  title: "Abandonner un suivi",
  kind: "delete",
  description:
    'Abandons a run in progress, as "Abandonner le suivi": it is deleted with its photos and comments; nothing was written to the bike or the stock. The dry run says what would go; abandon only once the owner has confirmed.',
  input: z.strictObject({
    run_id: z.number().describe("The run (get_run)."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { run_id: runId, dry_run: dryRun }) => {
    const run = getRun(ctx, runId);
    if (!run) return notFound();
    if (run.status !== "in_progress") {
      return refused(
        [{ field: "run_id", message: "Ce suivi est terminé." }],
        "Nothing was deleted.",
      );
    }
    const photos = run.steps.reduce(
      (sum, step) =>
        sum + (listAttachments(ctx, { kind: "procedure_run_step", id: step.id })?.length ?? 0),
      0,
    );
    const what = {
      run: { id: run.id, title: run.title, steps: run.steps.length },
      steps_done: run.steps.filter((s) => s.doneAt != null).length,
      photo_count: photos,
    };
    // Never through previewWrite: abandoning removes the photos' files after the delete (D-76).
    if (dryRun) {
      return answer(`Dry run: would abandon "${run.title}". Nothing was deleted.`, {
        dry_run: true,
        ...what,
        warnings: [],
      });
    }
    if (!abandonRun(ctx, runId).ok) return notFound();
    logWrite(ctx, "abandon_run", { run_id: runId });
    return answer(`Abandoned "${run.title}".`, { dry_run: false, ...what, warnings: [] });
  },
});

export const runTools = [
  startRunTool,
  getRunTool,
  updateRunStepsTool,
  finishRunTool,
  abandonRunTool,
];
