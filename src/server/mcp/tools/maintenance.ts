import "server-only";
import { z } from "zod";
import { formatItemStock, replacedTitle, slotLabel } from "@/lib/display";
import { isLocalDate } from "@/lib/format";
import { nameKey } from "@/lib/names";
import { MAINTENANCE_LINE_ACTIONS, MEASUREMENT_UNITS, SHOP_KINDS } from "@/lib/enums";
import { MAINTENANCE_ACTION_LABELS, REMOVAL_REASON_LABELS } from "@/lib/labels";
import type { MaintenanceLineInput } from "@/lib/view-models";
import { replacementError, replacePartSchema } from "@/server/actions/component-input";
import { maintenanceSchema } from "@/server/actions/maintenance-input";
import {
  atomically,
  createMaintenanceEvent,
  deleteMaintenanceEvent,
  getRun,
  listAttachments,
  listRunsOfEvents,
  getBike,
  getComponent,
  listBikes,
  listComponents,
  listMaintenanceEvents,
  listRules,
  listSuspensionSpecs,
  previewWrite,
  replaceComponent,
  updateMaintenanceEvent,
  type AccessContext,
  type Component,
  type MaintenanceEvent,
  type Rule,
} from "@/server/db";
import { inSlot } from "@/server/domain/rules";
import { eventInstant } from "@/server/domain/time";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { doneLine } from "@/server/views/rules";
import { maintenanceEdit } from "@/server/views/timeline";
import { loadGarage } from "@/server/views/workshop";
import { bikeUrl, describeComponent, describeRule, evaluateRules, type Ids } from "../describe";
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
  type FieldError,
} from "../tool";

// Maintenance done (feature 5, D-63) through the MCP (D-93): the maintenance sheet, whose lines
// can fulfil rules ("C'est fait": their counters restart), and "Remplacer une pièce", with a
// part taken from the workshop's stock. Same schemas, same data-access calls as the sheets.

const REFUSED = "The maintenance was refused; nothing was written.";

/** The event's page on the bike: its sheet opens on arrival (D-70). */
function eventUrl(bikeId: number, eventId: number): string {
  return `${bikeUrl(bikeId)}?event=${eventId}`;
}

const partLabel = (component: Component | undefined) =>
  component
    ? `${slotLabel(component.typeCode, component.position)}${component.model ? ` · ${component.model}` : ""}`
    : null;

/** An event as the tools answer it (record_maintenance, finish_run, list_maintenance…). */
export function describeEvent(
  event: MaintenanceEvent,
  components: Component[],
  ruleTitles: Map<number, string>,
  ids: Ids,
) {
  const parts = new Map(components.map((component) => [component.id, component]));
  return {
    id: ids === "real" ? event.id : null,
    bike_id: event.bikeId,
    on: event.performedOn,
    title: event.title,
    performed_by: event.performedBy,
    shop: event.shop ? { name: event.shop.name, kind: event.shop.kind } : null,
    total_cost_cents: event.totalCostCents,
    /** The time spent, typed at the end of a run (D-87); null otherwise. */
    labor_time_s: event.laborTimeS,
    notes: event.notes,
    lines: event.items.map((item) => ({
      action: item.action,
      action_label: MAINTENANCE_ACTION_LABELS[item.action],
      component_id: item.componentId,
      component_label: item.componentId == null ? null : partLabel(parts.get(item.componentId)),
      new_component_id: ids === "real" ? item.newComponentId : null,
      rule_id: item.ruleId,
      rule_title: item.ruleId == null ? null : (ruleTitles.get(item.ruleId) ?? null),
      description: item.description,
      cost_cents: item.costCents,
      measurement_value: item.measurementValue,
      measurement_unit: item.measurementUnit,
    })),
    url: ids === "real" ? eventUrl(event.bikeId, event.id) : null,
  };
}

function findEvent(ctx: AccessContext, bikeId: number, eventId: number) {
  return listMaintenanceEvents(ctx, bikeId).find((event) => event.id === eventId) ?? null;
}

type LineArgs = z.output<typeof lineInput>;

/**
 * The tool's lines as the sheet's: a line with a rule takes the app's own line for it
 * (`doneLine`) where the part or the action is left out; rules and parts checked against the bike.
 */
function resolveLines(
  given: LineArgs[],
  rules: Map<number, Rule>,
  components: Component[],
): { lines: MaintenanceLineInput[]; errors: FieldError[] } {
  const partIds = new Set(components.map((component) => component.id));
  const errors: FieldError[] = [];
  const lines = given.map((line, index): MaintenanceLineInput => {
    const field = (name: string) => `lines[${index}].${name}`;
    const rule = line.rule_id == null ? null : rules.get(line.rule_id);
    if (line.rule_id != null && !rule) {
      errors.push({ field: field("rule_id"), message: "Règle introuvable sur ce vélo." });
    }
    if (line.component_id != null && !partIds.has(line.component_id)) {
      errors.push({ field: field("component_id"), message: "Pièce introuvable sur ce vélo." });
    }
    if (line.action == null && line.rule_id == null) {
      errors.push({ field: field("action"), message: "Indique ce qui a été fait." });
    }
    const base = rule ? doneLine(rule, components) : null;
    return {
      action: line.action ?? base?.action ?? "other",
      componentId:
        line.component_id === undefined ? (base?.componentId ?? null) : line.component_id,
      ruleId: line.rule_id ?? null,
      description: line.description ?? null,
      costCents: line.cost_cents ?? null,
      measurementValue: line.measurement_value ?? null,
      measurementUnit: line.measurement_unit ?? null,
    };
  });
  return { lines, errors };
}

// --- record_maintenance --------------------------------------------------------------------------

const lineInput = z.strictObject({
  rule_id: z
    .number()
    .optional()
    .describe(
      'The maintenance rule this line fulfils (list_due_work, list_rules): its counter restarts from that day. With it, component_id and action default to the rule\'s part and "serviced" ("bled" for a brake).',
    ),
  component_id: z
    .number()
    .nullable()
    .optional()
    .describe("The part worked on (get_bike); null: the whole bike."),
  action: z
    .enum(MAINTENANCE_LINE_ACTIONS)
    .optional()
    .describe(
      "serviced, repaired, inspected, adjusted, cleaned, lubricated, bled, trued, other. Required without rule_id. A part changed is replace_component, not a line.",
    ),
  description: z.string().nullable().optional().describe('In French: "Joints SKF changés".'),
  cost_cents: z.number().nullable().optional().describe("This line's cost, euro cents."),
  measurement_value: z
    .number()
    .nullable()
    .optional()
    .describe("A measure taken: chain stretch (percent), pad thickness (mm)."),
  measurement_unit: z.enum(MEASUREMENT_UNITS).nullable().optional().describe("percent or mm."),
});

const recordMaintenanceTool = defineTool({
  name: "record_maintenance",
  title: "Enregistrer un entretien",
  kind: "write",
  description:
    "Records maintenance done on a bike, as the app's maintenance sheet: a day, a title, who did it (self or a shop), costs, and its lines (what was done, on which part). A line with rule_id is the app's \"C'est fait\" on that rule: its counter restarts from that day, and the answer gives the rule's new status. Several things done the same day go in one event (one line each). A part changed is replace_component (it can add its line to this event with event_id). Nothing is taken from the workshop's stock here. Call with dry_run true first.",
  input: z.strictObject({
    bike_id: z.number().describe("The bike (list_bikes)."),
    on: z
      .string()
      .optional()
      .describe("Day it was done, YYYY-MM-DD, not in the future (default today)."),
    title: z
      .string()
      .optional()
      .describe('In French: "Purge des freins". Omitted: the titles of the rules fulfilled.'),
    performed_by: z.enum(["self", "shop"]).optional().describe("self (default) or shop."),
    shop: z
      .strictObject({
        name: z.string(),
        kind: z.enum(SHOP_KINDS).optional().describe("physical (default) or online."),
      })
      .optional()
      .describe("performed_by shop: which one; matched against the workspace's shops."),
    total_cost_cents: z.number().nullable().optional().describe("What it cost in all, euro cents."),
    notes: z.string().nullable().optional(),
    lines: z.array(lineInput).describe("What was done, one line per intervention (up to 20)."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { bike_id: bikeId, dry_run: dryRun, ...args }) => {
    const bike = getBike(ctx, bikeId);
    if (!bike)
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    const components = listComponents(ctx, bikeId);
    const rules = new Map(listRules(ctx, bikeId).map((rule) => [rule.id, rule]));
    const { lines, errors } = resolveLines(args.lines, rules, components);
    if (errors.length) return refused(errors, REFUSED);

    const ruleTitles = lines.flatMap((line) =>
      line.ruleId == null ? [] : [rules.get(line.ruleId)!.title],
    );
    const performedBy = args.performed_by ?? (args.shop ? "shop" : "self");
    const parsed = maintenanceSchema(today()).safeParse({
      bikeId,
      on: args.on ?? today(),
      title: args.title ?? ruleTitles.join(" · ").slice(0, 120),
      performedBy,
      shop: args.shop ? { name: args.shop.name, kind: args.shop.kind ?? "physical" } : null,
      totalCostCents: args.total_cost_cents ?? null,
      notes: args.notes ?? null,
      lines,
    });
    if (!parsed.success) return refused(fieldErrorsOf(parsed.error.issues), REFUSED);
    const data = parsed.data;
    if (data.performedBy === "shop" && !data.shop) {
      return refused([{ field: "shop", message: "Indique l'atelier qui l'a fait." }], REFUSED);
    }
    if (data.performedBy === "self" && args.shop) {
      return refused(
        [{ field: "shop", message: "Seulement quand l'entretien a été fait en atelier." }],
        REFUSED,
      );
    }
    const ids: Ids = dryRun ? "none" : "real";

    const write = () => {
      const outcome = createMaintenanceEvent(ctx, {
        bikeId,
        performedOn: data.on,
        title: data.title,
        performedBy: data.performedBy,
        shop: data.performedBy === "shop" ? data.shop : null,
        totalCostCents: data.totalCostCents,
        notes: data.notes,
        recordedAt: Date.now(),
        lines: data.lines,
      });
      if (!outcome.ok) {
        throw new ToolRefusal(
          [
            outcome.reason === "unknown_rule"
              ? { field: "lines", message: "Règle introuvable sur ce vélo." }
              : outcome.reason === "unknown_part"
                ? { field: "lines", message: "Pièce introuvable sur ce vélo." }
                : { field: "bike_id", message: "Vélo introuvable." },
          ],
          REFUSED,
        );
      }
      const evaluations = evaluateRules(ctx, bikeId);
      const fulfilled = [
        ...new Set(data.lines.flatMap((l) => (l.ruleId == null ? [] : [l.ruleId]))),
      ];
      const titles = new Map([...rules].map(([id, rule]) => [id, rule.title]));
      return {
        eventId: outcome.eventId,
        event: describeEvent(findEvent(ctx, bikeId, outcome.eventId)!, components, titles, ids),
        rules: fulfilled.map((ruleId) =>
          describeRule(rules.get(ruleId)!, "real", evaluations.get(ruleId)),
        ),
      };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "record_maintenance", { event_id: result.eventId });
    const late = result.rules.filter(
      (rule) => rule.status === "overdue" || rule.status === "due_soon",
    );
    return answer(
      dryRun
        ? `Dry run: would record "${result.event.title}" on ${data.on} for ${bike.name} (${result.event.lines.length} line(s), ${result.rules.length} rule(s) restarted). Nothing was written.`
        : `Recorded "${result.event.title}" (event ${result.eventId}) for ${bike.name}.`,
      {
        dry_run: dryRun,
        event: result.event,
        rules_restarted: result.rules,
        warnings: late.length
          ? [
              `${late.length} rule(s) still due soon or overdue after this (rules_restarted[].status): the day given is long ago, or another interval drives it.`,
            ]
          : [],
        bike_url: bikeUrl(bikeId),
      },
    );
  },
});

// --- replace_component ---------------------------------------------------------------------------

const replaceComponentTool = defineTool({
  name: "replace_component",
  title: "Remplacer une pièce",
  kind: "write",
  description:
    "Replaces a part fitted to a bike, as \"Remplacer une pièce\": the old part is removed (reason worn, broken, crash, upgrade, other), the new one fitted in its slot from that day, and a maintenance event records it with its price. from_item_id takes the new part from the workshop (list_workshop_items, a part of that type): one unit leaves its stock, and brand, model and price default to the item's. Otherwise give model (and brand, price_cents). The slot's rules that restart on replacement count again from that day. event_id adds the line to a maintenance event of the same bike and day (record_maintenance) instead of creating one. Call with dry_run true first.",
  input: z.strictObject({
    component_id: z.number().describe("The part removed (get_bike)."),
    on: z
      .string()
      .optional()
      .describe("Day it was done, YYYY-MM-DD, not in the future (default today)."),
    reason: z.enum(["worn", "broken", "crash", "upgrade", "other"]),
    removal_note: z.string().nullable().optional().describe("A short note on the old part."),
    from_item_id: z.number().nullable().optional().describe("A workshop part taken from stock."),
    brand: z.string().nullable().optional().describe("The new part's brand."),
    model: z.string().optional().describe("The new part's model (required without from_item_id)."),
    price_cents: z.number().nullable().optional().describe("The new part's price, euro cents."),
    event_id: z
      .number()
      .nullable()
      .optional()
      .describe("A maintenance event of the same bike and day to add this replacement to."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { component_id: componentId, dry_run: dryRun, ...args }) => {
    const old = getComponent(ctx, componentId);
    if (!old) {
      return refused([{ field: "component_id", message: "Pièce introuvable." }], "Unknown part.");
    }
    const { timeZone } = getEnv();
    const garage = loadGarage(ctx);
    const item =
      args.from_item_id == null
        ? null
        : (garage.items.find((i) => i.id === args.from_item_id) ?? null);
    if (args.from_item_id != null && (!item || item.kind !== "part")) {
      return refused(
        [
          {
            field: "from_item_id",
            message: item
              ? "Seule une pièce de l'atelier peut être montée."
              : "Objet de l'atelier introuvable.",
          },
        ],
        REFUSED,
      );
    }
    const parsed = replacePartSchema(today()).safeParse({
      removedComponentId: old.id,
      on: args.on ?? today(),
      eventId: args.event_id ?? null,
      reason: args.reason,
      removalNote: args.removal_note ?? null,
      fromItemId: item?.id ?? null,
      brand: args.brand === undefined ? (item?.brand ?? null) : args.brand,
      model: args.model ?? item?.name ?? "",
      priceCents:
        args.price_cents === undefined ? (item?.lastUnitCostCents ?? null) : args.price_cents,
    });
    if (!parsed.success) {
      return refused(
        fieldErrorsOf(parsed.error.issues, "", {
          removedComponentId: "component_id",
          eventId: "event_id",
          fromItemId: "from_item_id",
        }),
        REFUSED,
      );
    }
    const data = parsed.data;
    const warnings: string[] = [];
    if (item && item.componentTypeCode != null && item.componentTypeCode !== old.typeCode) {
      warnings.push(
        `The workshop item "${item.name}" is for another part type (${item.componentTypeCode}), not ${old.typeCode}: check with the owner.`,
      );
    }
    const ids: Ids = dryRun ? "none" : "real";
    const slotRules = listRules(ctx, old.bikeId).filter(
      (rule) => rule.resetOnReplacement && inSlot(rule, old),
    );

    const write = () => {
      const recordedAt = Date.now();
      const outcome = replaceComponent(ctx, {
        removedComponentId: old.id,
        on: data.on,
        recordedAt,
        at: eventInstant(data.on, recordedAt, timeZone),
        reason: data.reason,
        removalNote: data.removalNote,
        newPart: {
          brand: data.brand,
          model: data.model,
          reference: item?.reference ?? null,
          priceCents: data.priceCents,
        },
        fromItemId: item?.id ?? null,
        eventTitle: replacedTitle(old.typeCode, old.position),
        eventId: data.eventId,
      });
      if (!outcome.ok) {
        const field =
          outcome.reason === "before_fitting"
            ? "on"
            : outcome.reason === "event_not_found"
              ? "event_id"
              : outcome.reason === "out_of_stock" || outcome.reason === "item_not_found"
                ? "from_item_id"
                : "component_id";
        throw new ToolRefusal([{ field, message: replacementError(outcome, timeZone) }], REFUSED);
      }
      const fitted = getComponent(ctx, outcome.newComponentId)!;
      const specs = new Map(listSuspensionSpecs(ctx, old.bikeId).map((s) => [s.componentId, s]));
      const evaluations = evaluateRules(ctx, old.bikeId);
      const after = item ? loadGarage(ctx).items.find((i) => i.id === item.id) : null;
      return {
        outcome,
        removed: describeComponent(getComponent(ctx, old.id)!, specs.get(old.id), "real"),
        fitted: describeComponent(fitted, specs.get(fitted.id), ids),
        rules: slotRules.map((rule) => describeRule(rule, "real", evaluations.get(rule.id))),
        stock: after
          ? { item_id: after.id, name: after.name, stock_text: formatItemStock(after) }
          : null,
      };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) {
      logWrite(ctx, "replace_component", {
        component_id: old.id,
        new_component_id: result.outcome.newComponentId,
        event_id: result.outcome.eventId,
      });
    }
    const title = replacedTitle(old.typeCode, old.position);
    return answer(
      dryRun
        ? `Dry run: ${title} on ${data.on} (${REMOVAL_REASON_LABELS[data.reason]}), new part "${data.model}". Nothing was written.`
        : `${title} (new part ${result.outcome.newComponentId}, event ${result.outcome.eventId}).`,
      {
        dry_run: dryRun,
        removed: result.removed,
        fitted: result.fitted,
        event_id: ids === "real" ? result.outcome.eventId : null,
        stock_after: result.stock,
        rules_restarted: result.rules,
        warnings,
        bike_url:
          ids === "real" ? eventUrl(old.bikeId, result.outcome.eventId) : bikeUrl(old.bikeId),
      },
    );
  },
});

// --- list_maintenance ----------------------------------------------------------------------------

const listMaintenanceTool = defineTool({
  name: "list_maintenance",
  title: "Historique d'entretien",
  kind: "read",
  description:
    "The maintenance history, newest first: each event's bike (id and name), day, title, who did it, costs, time spent (labor_time_s, a run's), and its lines (action, part, the rule it fulfilled, a part replaced with the new one fitted, measures). Filters: bike_id, from and to (days, both included), component_id (lines on that part, as removed or fitted), rule_id (the times that rule was done), query (title, notes and lines' descriptions, ignoring case and accents). Answers \"when did I last…?\".",
  input: z.strictObject({
    bike_id: z.number().optional().describe("Only this bike (list_bikes)."),
    from: z.string().optional().describe("First day, YYYY-MM-DD."),
    to: z.string().optional().describe("Last day, YYYY-MM-DD."),
    component_id: z.number().optional().describe("Only the events touching this part."),
    rule_id: z.number().optional().describe("Only the events that fulfilled this rule."),
    query: z.string().optional(),
    ...pageInput,
  }),
  run: (
    ctx,
    { bike_id: bikeId, from, to, component_id: partId, rule_id: ruleId, query, ...page },
  ) => {
    const errors: FieldError[] = [];
    if (bikeId != null && !getBike(ctx, bikeId)) {
      errors.push({ field: "bike_id", message: "Vélo introuvable." });
    }
    for (const [field, value] of [
      ["from", from],
      ["to", to],
    ] as const) {
      if (value != null && !isLocalDate(value)) errors.push({ field, message: "Date invalide." });
    }
    if (errors.length) return refused(errors, "The filters were refused.");
    const bikes = listBikes(ctx).filter((bike) => bikeId == null || bike.id === bikeId);
    const components = bikes.flatMap((bike) => listComponents(ctx, bike.id));
    const titles = new Map(
      bikes.flatMap((bike) => listRules(ctx, bike.id).map((r) => [r.id, r.title] as const)),
    );
    const names = new Map(bikes.map((bike) => [bike.id, bike.name]));
    const words = query ? nameKey(query) : "";
    const events = listMaintenanceEvents(ctx, bikeId ?? null).filter(
      (event) =>
        (from == null || event.performedOn >= from) &&
        (to == null || event.performedOn <= to) &&
        (partId == null ||
          event.items.some((i) => i.componentId === partId || i.newComponentId === partId)) &&
        (ruleId == null || event.items.some((i) => i.ruleId === ruleId)) &&
        (!words ||
          nameKey(
            [event.title, event.notes, ...event.items.map((i) => i.description)]
              .filter(Boolean)
              .join(" "),
          ).includes(words)),
    );
    const { items, next_cursor } = paginate(events, (event) => String(event.id), page);
    return answer(`${items.length} of ${events.length} maintenance events.`, {
      events: items.map((event) => {
        // `bike` replaces `bike_id` here: the list spans bikes (D-100).
        const { bike_id: eventBikeId, ...described } = describeEvent(
          event,
          components,
          titles,
          "real",
        );
        return { bike: { id: eventBikeId, name: names.get(eventBikeId) ?? "" }, ...described };
      }),
      next_cursor,
    });
  },
});

// --- update_maintenance --------------------------------------------------------------------------

const updateMaintenanceTool = defineTool({
  name: "update_maintenance",
  title: "Modifier un entretien",
  kind: "write",
  description:
    "Changes a maintenance event, as \"Modifier l'entretien\": only the fields given change. lines, when given, replace the event's lines (same shape as record_maintenance; a rule_id fulfils that rule from the event's day); its replacements always stay, and follow a new day. Moving the day is refused when a replaced part was fitted after it, or the part fitted already removed. Call with dry_run true first.",
  input: z.strictObject({
    event_id: z.number().describe("The maintenance event (list_maintenance)."),
    on: z.string().optional().describe("YYYY-MM-DD, not in the future."),
    title: z.string().optional(),
    performed_by: z.enum(["self", "shop"]).optional(),
    shop: z
      .strictObject({ name: z.string(), kind: z.enum(SHOP_KINDS).optional() })
      .nullable()
      .optional(),
    total_cost_cents: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    lines: z.array(lineInput).optional().describe("All its lines but the replacements."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { event_id: eventId, dry_run: dryRun, ...args }) => {
    const event = listMaintenanceEvents(ctx, null).find((e) => e.id === eventId);
    if (!event) {
      return refused([{ field: "event_id", message: "Entretien introuvable." }], "Unknown event.");
    }
    const bikeId = event.bikeId;
    const components = listComponents(ctx, bikeId);
    const rules = new Map(listRules(ctx, bikeId).map((rule) => [rule.id, rule]));
    const current = maintenanceEdit(event, components).input;
    let lines = current.lines;
    if (args.lines) {
      const resolved = resolveLines(args.lines, rules, components);
      if (resolved.errors.length) return refused(resolved.errors, REFUSED);
      lines = resolved.lines;
    }
    const performedBy = args.performed_by ?? (args.shop ? "shop" : current.performedBy);
    const shop =
      args.shop === undefined
        ? current.shop
        : args.shop && { name: args.shop.name, kind: args.shop.kind ?? "physical" };
    const parsed = maintenanceSchema(today()).safeParse({
      ...current,
      on: args.on ?? current.on,
      title: args.title ?? current.title,
      performedBy,
      shop: performedBy === "shop" ? shop : null,
      totalCostCents:
        args.total_cost_cents === undefined ? current.totalCostCents : args.total_cost_cents,
      notes: args.notes === undefined ? current.notes : args.notes,
      lines,
    });
    if (!parsed.success) return refused(fieldErrorsOf(parsed.error.issues), REFUSED);
    const data = parsed.data;
    if (data.performedBy === "shop" && !data.shop) {
      return refused([{ field: "shop", message: "Indique l'atelier qui l'a fait." }], REFUSED);
    }
    const titles = new Map([...rules].map(([id, rule]) => [id, rule.title]));
    const { timeZone } = getEnv();
    const write = () => {
      const outcome = updateMaintenanceEvent(
        ctx,
        eventId,
        {
          performedOn: data.on,
          title: data.title,
          performedBy: data.performedBy,
          shop: data.performedBy === "shop" ? data.shop : null,
          totalCostCents: data.totalCostCents,
          notes: data.notes,
          lines: data.lines,
        },
        timeZone,
      );
      if (!outcome.ok) {
        const [field, message] = {
          not_found: ["event_id", "Entretien introuvable."],
          unknown_part: ["lines", "Pièce introuvable sur ce vélo."],
          unknown_rule: ["lines", "Règle introuvable sur ce vélo."],
          before_fitting: ["on", "La pièce remplacée a été montée après cette date."],
          after_removal: [
            "on",
            "La pièce montée par cet entretien a été remplacée avant cette date.",
          ],
        }[outcome.reason];
        throw new ToolRefusal([{ field, message }], REFUSED);
      }
      const after = listComponents(ctx, bikeId);
      const evaluations = evaluateRules(ctx, bikeId);
      const fulfilled = [
        ...new Set(data.lines.flatMap((l) => (l.ruleId == null ? [] : [l.ruleId]))),
      ];
      return {
        event: describeEvent(findEvent(ctx, bikeId, eventId)!, after, titles, "real"),
        rules: fulfilled.map((ruleId) =>
          describeRule(rules.get(ruleId)!, "real", evaluations.get(ruleId)),
        ),
      };
    };
    const before = describeEvent(event, components, titles, "real");
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "update_maintenance", { event_id: eventId });
    return answer(
      dryRun
        ? `Dry run: would change "${result.event.title}". Nothing was written.`
        : `Changed "${result.event.title}" (event ${eventId}).`,
      { dry_run: dryRun, event: result.event, before, rules_fulfilled: result.rules, warnings: [] },
    );
  },
});

// --- delete_maintenance --------------------------------------------------------------------------

const deleteMaintenanceTool = defineTool({
  name: "delete_maintenance",
  title: "Supprimer un entretien",
  kind: "delete",
  description:
    'Deletes a maintenance event recorded by mistake, as "Supprimer l\'entretien": for good, with its attachments. Its replacements are undone (the old part is fitted again, the new one removed), the parts and product levels a run took are given back to the workshop, and its run goes with it; the rules it fulfilled count again from before. Refused when a part it fitted was replaced or serviced since: correct those events first. The dry run says what would go; delete only once the owner has confirmed.',
  input: z.strictObject({
    event_id: z.number().describe("The maintenance event (list_maintenance)."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { event_id: eventId, dry_run: dryRun }) => {
    const event = listMaintenanceEvents(ctx, null).find((e) => e.id === eventId);
    if (!event) {
      return refused([{ field: "event_id", message: "Entretien introuvable." }], "Unknown event.");
    }
    const bikeId = event.bikeId;
    const components = listComponents(ctx, bikeId);
    const rules = new Map(listRules(ctx, bikeId).map((rule) => [rule.id, rule]));
    const titles = new Map([...rules].map(([id, rule]) => [id, rule.title]));
    const runs = listRunsOfEvents(ctx, [eventId]);
    // Every file the delete would take: the event's, the parts its replacements fitted, its run's.
    const files =
      (listAttachments(ctx, { kind: "maintenance_event", id: eventId })?.length ?? 0) +
      event.items.reduce(
        (sum, item) =>
          sum +
          (item.newComponentId == null
            ? 0
            : (listAttachments(ctx, { kind: "component", id: item.newComponentId })?.length ?? 0)),
        0,
      ) +
      runs.reduce(
        (sum, run) =>
          sum +
          (getRun(ctx, run.id)?.steps.reduce(
            (n, step) =>
              n + (listAttachments(ctx, { kind: "procedure_run_step", id: step.id })?.length ?? 0),
            0,
          ) ?? 0),
        0,
      );
    const described = describeEvent(event, components, titles, "real");
    const fulfilled = [
      ...new Set(event.items.flatMap((i) => (i.ruleId == null ? [] : [i.ruleId]))),
    ];
    const summary = {
      event: described,
      replacements_undone: event.items.filter((i) => i.action === "replaced").length,
      run_deleted: runs.length > 0,
      attachment_count: files,
    };
    const remove = () => {
      const outcome = deleteMaintenanceEvent(ctx, eventId);
      if (!outcome.ok) {
        throw new ToolRefusal(
          [
            {
              field: "event_id",
              message:
                outcome.reason === "too_late"
                  ? "La pièce montée par cet entretien a été remplacée ou entretenue depuis : modifie d'abord ces entretiens-là."
                  : "Entretien introuvable.",
            },
          ],
          "Nothing was deleted.",
        );
      }
      const evaluations = evaluateRules(ctx, bikeId);
      return fulfilled.flatMap((ruleId) =>
        rules.has(ruleId)
          ? [describeRule(rules.get(ruleId)!, "real", evaluations.get(ruleId))]
          : [],
      );
    };
    // The delete removes files after it is done (D-76): a dry run runs it only when no file is
    // involved, which also checks that it is allowed; otherwise it describes it.
    if (dryRun && files > 0) {
      return answer(`Dry run: would delete "${event.title}". Nothing was deleted.`, {
        dry_run: true,
        ...summary,
        rules_after: null,
        warnings: [`${files} attachment(s) would be deleted with it, files included.`],
      });
    }
    const rulesAfter = dryRun ? previewWrite(remove) : remove();
    if (!dryRun) logWrite(ctx, "delete_maintenance", { event_id: eventId });
    return answer(
      dryRun
        ? `Dry run: would delete "${event.title}". Nothing was deleted.`
        : `Deleted "${event.title}" (event ${eventId}).`,
      { dry_run: dryRun, ...summary, rules_after: rulesAfter, warnings: [] },
    );
  },
});

export const maintenanceTools = [
  listMaintenanceTool,
  recordMaintenanceTool,
  updateMaintenanceTool,
  deleteMaintenanceTool,
  replaceComponentTool,
];
