import "server-only";
import { z } from "zod";
import { COMPONENT_TYPE_CODES } from "@/lib/enums";
import { addDays, startOfLocalDay } from "@/lib/format";
import { ruleInputSchema, snoozeUntilSchema, toRuleData } from "@/server/actions/rule-input";
import {
  atomically,
  createRule,
  getBike,
  listComponents,
  listBikes,
  listComponentTypes,
  listProcedures,
  listRules,
  previewWrite,
  snoozeRule,
  updateRule,
  type AccessContext,
  type Rule,
} from "@/server/db";
import { trackingStartOn } from "@/server/domain/bikes";
import type { RuleEvaluation } from "@/server/domain/rules";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { ruleFormInput, ruleSlots, slotValue } from "@/server/views/rules";
import { bikeUrl, describeRule, evaluateRules, type Ids } from "../describe";
import {
  answer,
  defineTool,
  dryRunInput,
  fieldErrorsOf,
  logWrite,
  pageInput,
  paginate,
  refused,
  ToolRefusal,
} from "../tool";

// Maintenance rules of a bike (feature 6), through the "Règles" sheet's own schema and slots: a
// rule on the whole bike, on one end of a front/rear type, on both ends, or on a single-slot type.

const RENAME = { slot: "component_type_code" };

/** The sheet's slot value: "bike", `type:front`, `type:rear` or `type:*` (both ends, or none). */
function slotOf(type: string | null | undefined, position: "front" | "rear" | "both" | undefined) {
  if (type == null) return "bike";
  return `${type}:${position === "front" || position === "rear" ? position : "*"}`;
}

/** A rule as the tools answer it: its definition, the sheet's slot label and its status now. */
function describeFullRule(
  rule: Rule,
  slotLabels: Map<string, string>,
  ids: Ids,
  evaluation?: RuleEvaluation,
) {
  return {
    ...describeRule(rule, ids, evaluation),
    slot_label: slotLabels.get(slotValue(rule)) ?? null,
    warn_ratio: rule.warnRatio,
    reset_on_replacement: rule.resetOnReplacement,
    active: rule.active,
    /** "Reporter" (D-105): the day a snooze ends, after today; it hides the rule while due. */
    snoozed_until:
      rule.snoozeEndsOn != null && rule.snoozeEndsOn > today() ? rule.snoozeEndsOn : null,
    notes: rule.notes,
  };
}

function slotLabelsOf(ctx: AccessContext, bikeId: number): Map<string, string> {
  const slots = ruleSlots(listComponents(ctx, bikeId), listComponentTypes());
  return new Map(slots.map((slot) => [slot.value, slot.label]));
}

const notFound = (field: string, message: string) =>
  refused([{ field, message }], `${message} (${field})`);

// --- Tools ---------------------------------------------------------------------------------------

const listRulesTool = defineTool({
  name: "list_rules",
  title: "Règles d'entretien d'un vélo",
  kind: "read",
  description:
    'A bike\'s maintenance rules, in the order they were created: title, the part type and end it applies to (component_type_code null: the whole bike; position null: every part of the type), intervals (metres, seconds of wear, days), status now (ok, due_soon, overdue, snoozed; null when inactive), snoozed_until (the day a snooze ends, as "Reporter"), the day it counts from and, for day-based ones, the day it falls due. Read it before add_rule to avoid a duplicate.',
  input: z.strictObject({
    bike_id: z.number().describe("The bike (list_bikes)."),
    ...pageInput,
  }),
  run: (ctx, { bike_id: bikeId, ...page }) => {
    if (!getBike(ctx, bikeId)) return notFound("bike_id", "Vélo introuvable.");
    const rules = listRules(ctx, bikeId);
    const evaluations = evaluateRules(ctx, bikeId);
    const labels = slotLabelsOf(ctx, bikeId);
    const { items, next_cursor } = paginate(rules, (rule) => String(rule.id), page);
    return answer(`${items.length} of ${rules.length} rules.`, {
      rules: items.map((rule) => describeFullRule(rule, labels, "real", evaluations.get(rule.id))),
      next_cursor,
      bike_url: bikeUrl(bikeId),
    });
  },
});

const addRuleTool = defineTool({
  name: "add_rule",
  title: "Ajouter une règle d'entretien",
  kind: "write",
  description:
    "Adds a maintenance rule to a bike, as the app's \"Règles\" sheet does: on the whole bike (component_type_code omitted), or on a part type fitted to it. At least one interval: metres ridden, seconds of wear, or days. Without last_done_on the rule counts from the start of tracking (the bike's purchase day), or from the fitting of the slot's current part when reset_on_replacement is true and it was fitted later; a day-based rule can then start overdue: the dry run gives its status, ask the owner when it was last done. Call with dry_run true first.",
  input: z.strictObject({
    bike_id: z.number().describe("The bike (list_bikes)."),
    component_type_code: z
      .enum(COMPONENT_TYPE_CODES)
      .nullable()
      .optional()
      .describe(
        "The part type it applies to (list_component_types); a part of that type must be fitted. Omitted or null: the whole bike.",
      ),
    position: z
      .enum(["front", "rear", "both"])
      .optional()
      .describe(
        "For the types that exist on both ends (brake, brake_pads, rotor, wheel, tire, hub_bearings): front, rear, or both (one rule for both ends, the default). Omit for the others.",
      ),
    title: z
      .string()
      .describe('In French, as the owner reads it: "Contrôle d\'usure des plaquettes".'),
    interval_distance_m: z
      .number()
      .nullable()
      .optional()
      .describe("Metres ridden between two services (integer, 1 000 km → 1000000)."),
    interval_wear_s: z
      .number()
      .nullable()
      .optional()
      .describe("Seconds of wear between two services (integer, 50 h → 180000)."),
    interval_days: z
      .number()
      .nullable()
      .optional()
      .describe("Days between two services (integer, 1 to 3650)."),
    warn_ratio: z
      .number()
      .optional()
      .describe("Share of the interval from which it is due soon, 0.5 to 0.99 (default 0.9)."),
    reset_on_replacement: z
      .boolean()
      .optional()
      .describe(
        "true (default): replacing the part restarts the rule. Ignored for a whole-bike rule.",
      ),
    last_done_on: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Day this maintenance was last done, YYYY-MM-DD, not in the future: the rule counts from the end of that day.",
      ),
    notes: z.string().nullable().optional(),
    dry_run: dryRunInput,
  }),
  run: (ctx, { bike_id: bikeId, dry_run: dryRun, ...args }) => {
    const bike = getBike(ctx, bikeId);
    if (!bike) return notFound("bike_id", "Vélo introuvable.");
    const { timeZone } = getEnv();
    const hasPosition = listComponentTypes().some(
      (type) => type.code === args.component_type_code && type.hasPosition,
    );
    if (args.position && args.position !== "both" && !hasPosition) {
      return refused(
        [{ field: "position", message: "Ce type de pièce n'a pas d'avant ni d'arrière." }],
        "The rule was refused; nothing was written.",
      );
    }
    const parsed = ruleInputSchema(today()).safeParse({
      slot: slotOf(args.component_type_code, args.position),
      title: args.title,
      intervalDistanceM: args.interval_distance_m ?? null,
      intervalWearS: args.interval_wear_s ?? null,
      intervalDays: args.interval_days ?? null,
      warnRatio: args.warn_ratio ?? 0.9,
      resetOnReplacement: args.reset_on_replacement ?? true,
      lastDoneOn: args.last_done_on ?? null,
      active: true,
      notes: args.notes ?? null,
    });
    if (!parsed.success) {
      return refused(
        fieldErrorsOf(parsed.error.issues, "", RENAME),
        "The rule was refused; nothing was written.",
      );
    }
    // The slots the sheet offers: the whole bike and the parts fitted to it.
    const labels = slotLabelsOf(ctx, bikeId);
    if (!labels.has(parsed.data.slot)) {
      return refused(
        [
          {
            field: "component_type_code",
            message: "Aucune pièce de ce type n'est montée à cet emplacement.",
          },
        ],
        "The rule was refused; nothing was written.",
      );
    }
    const data = toRuleData(
      parsed.data,
      startOfLocalDay(trackingStartOn(bike, timeZone), timeZone),
      timeZone,
    );
    const ids: Ids = dryRun ? "none" : "real";

    const write = () => {
      const outcome = createRule(ctx, bikeId, data);
      if (!outcome.ok) throw new ToolRefusal([{ field: "bike_id", message: "Vélo introuvable." }]);
      const rule = listRules(ctx, bikeId).find((r) => r.id === outcome.ruleId)!;
      return {
        ruleId: outcome.ruleId,
        rule: describeFullRule(rule, labels, ids, evaluateRules(ctx, bikeId).get(rule.id)),
      };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "add_rule", { rule_id: result.ruleId });
    const late = result.rule.status === "overdue" || result.rule.status === "due_soon";
    return answer(
      dryRun
        ? `Dry run: would add the rule "${result.rule.title}" to ${bike.name} (${result.rule.status}). Nothing was written.`
        : `Added the rule "${result.rule.title}" (rule ${result.ruleId}) to ${bike.name}.`,
      {
        dry_run: dryRun,
        rule: result.rule,
        warnings: late
          ? [
              dryRun
                ? "The rule would start overdue or due soon (rule.status): ask the owner when it was last done and pass it as last_done_on (today if they do not know)."
                : 'The rule starts overdue or due soon (rule.status): the owner can set when it was last done in the app\'s "Règles" sheet.',
            ]
          : [],
        bike_url: bikeUrl(bikeId),
      },
    );
  },
});

/** A rule of the workspace with its bike, or null. */
function findRule(ctx: AccessContext, ruleId: number) {
  for (const bike of listBikes(ctx)) {
    const rule = listRules(ctx, bike.id).find((r) => r.id === ruleId);
    if (rule) return { bike, rule };
  }
  return null;
}

const updateRuleTool = defineTool({
  name: "update_rule",
  title: "Modifier une règle d'entretien",
  kind: "write",
  description:
    'Changes a maintenance rule, as "Modifier la règle" in the "Règles" sheet: only the fields given change; null clears an interval, last_done_on or the procedure. active false pauses the rule (it leaves "À prévoir"; the app\'s "Désactiver"). The part type and end it applies to never change: add another rule instead. last_done_on sets the day its counter starts from, as "Dernière fois" (a maintenance done is record_maintenance). The answer gives its status now. Call with dry_run true first.',
  input: z.strictObject({
    rule_id: z.number().describe("The rule (list_rules, list_due_work)."),
    title: z.string().optional(),
    interval_distance_m: z.number().nullable().optional().describe("Metres, or null."),
    interval_wear_s: z.number().nullable().optional().describe("Seconds of wear, or null."),
    interval_days: z.number().nullable().optional().describe("Days, 1 to 3650, or null."),
    warn_ratio: z.number().optional().describe("0.5 to 0.99."),
    reset_on_replacement: z.boolean().optional(),
    last_done_on: z.string().nullable().optional().describe("YYYY-MM-DD, or null."),
    active: z.boolean().optional(),
    notes: z.string().nullable().optional(),
    procedure_id: z
      .number()
      .nullable()
      .optional()
      .describe("The procedure it is done with (list_procedures), or null."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { rule_id: ruleId, dry_run: dryRun, ...args }) => {
    const found = findRule(ctx, ruleId);
    if (!found) return notFound("rule_id", "Règle introuvable.");
    const { bike, rule } = found;
    const { timeZone } = getEnv();
    const trackingStartAt = startOfLocalDay(trackingStartOn(bike, timeZone), timeZone);
    const current = ruleFormInput(rule, trackingStartAt, timeZone);
    const pick = <T>(value: T | undefined, base: T) => (value === undefined ? base : value);
    const parsed = ruleInputSchema(today()).safeParse({
      ...current,
      title: args.title ?? current.title,
      intervalDistanceM: pick(args.interval_distance_m, current.intervalDistanceM),
      intervalWearS: pick(args.interval_wear_s, current.intervalWearS),
      intervalDays: pick(args.interval_days, current.intervalDays),
      warnRatio: args.warn_ratio ?? current.warnRatio,
      resetOnReplacement: args.reset_on_replacement ?? current.resetOnReplacement,
      lastDoneOn: pick(args.last_done_on, current.lastDoneOn),
      active: args.active ?? current.active,
      notes: pick(args.notes, current.notes),
      procedureId: pick(args.procedure_id, current.procedureId),
    });
    if (!parsed.success) {
      return refused(
        fieldErrorsOf(parsed.error.issues, "", RENAME),
        "The rule was refused; nothing was written.",
      );
    }
    if (parsed.data.procedureId != null) {
      const procedure = listProcedures(ctx).find((p) => p.id === parsed.data.procedureId);
      if (!procedure || procedure.archivedAt != null) {
        return refused(
          [
            {
              field: "procedure_id",
              message: procedure ? "Cette fiche est archivée." : "Fiche introuvable.",
            },
          ],
          "The rule was refused; nothing was written.",
        );
      }
    }
    const data = toRuleData(parsed.data, trackingStartAt, timeZone);
    const labels = slotLabelsOf(ctx, bike.id);
    const write = () => {
      if (!updateRule(ctx, ruleId, data).ok) {
        throw new ToolRefusal([{ field: "rule_id", message: "Règle introuvable." }]);
      }
      const updated = listRules(ctx, bike.id).find((r) => r.id === ruleId)!;
      return describeFullRule(updated, labels, "real", evaluateRules(ctx, bike.id).get(ruleId));
    };
    const before = describeFullRule(rule, labels, "real", evaluateRules(ctx, bike.id).get(ruleId));
    const after = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "update_rule", { rule_id: ruleId });
    return answer(
      dryRun
        ? `Dry run: would change the rule "${after.title}" of ${bike.name} (${before.status ?? "inactive"} → ${after.status ?? "inactive"}). Nothing was written.`
        : `Changed the rule "${after.title}" of ${bike.name}.`,
      { dry_run: dryRun, rule: after, before, warnings: [], bike_url: bikeUrl(bike.id) },
    );
  },
});

const SNOOZE_DAYS = 14;

const snoozeRuleTool = defineTool({
  name: "snooze_rule",
  title: "Reporter une règle",
  kind: "write",
  description:
    'Snoozes a maintenance rule, as "Reporter" in "À prévoir": while it is due (overdue or due soon) it leaves the due list until that day (status snoozed), then comes back if still due; done before, it is simply up to date. until: the day, YYYY-MM-DD, after today and within ten years (default: in 14 days); null cancels a snooze ("Réactiver"). Call with dry_run true first.',
  input: z.strictObject({
    rule_id: z.number().describe("The rule (list_due_work, list_rules)."),
    until: z.string().nullable().optional(),
    dry_run: dryRunInput,
  }),
  run: (ctx, { rule_id: ruleId, until, dry_run: dryRun }) => {
    const found = findRule(ctx, ruleId);
    if (!found) return notFound("rule_id", "Règle introuvable.");
    const day = today();
    const end = until === undefined ? addDays(day, SNOOZE_DAYS) : until;
    const checked = snoozeUntilSchema(day).nullable().safeParse(end);
    if (!checked.success) {
      return refused(
        [{ field: "until", message: checked.error.issues[0]?.message ?? "Date invalide." }],
        "The snooze was refused; nothing was written.",
      );
    }
    const { bike, rule } = found;
    const labels = slotLabelsOf(ctx, bike.id);
    const write = () => {
      if (!snoozeRule(ctx, ruleId, end).ok) {
        throw new ToolRefusal([{ field: "rule_id", message: "Règle introuvable." }]);
      }
      const updated = listRules(ctx, bike.id).find((r) => r.id === ruleId)!;
      return describeFullRule(updated, labels, "real", evaluateRules(ctx, bike.id).get(ruleId));
    };
    const after = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "snooze_rule", { rule_id: ruleId });
    const what = end ? `snoozed until ${end}` : "no longer snoozed";
    return answer(
      dryRun
        ? `Dry run: the rule "${rule.title}" would be ${what}. Nothing was written.`
        : `The rule "${rule.title}" is ${what}.`,
      {
        dry_run: dryRun,
        rule: after,
        warnings: [],
        bike_url: bikeUrl(bike.id),
      },
    );
  },
});

export const ruleTools = [listRulesTool, addRuleTool, updateRuleTool, snoozeRuleTool];
