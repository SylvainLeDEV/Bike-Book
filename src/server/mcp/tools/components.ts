import "server-only";
import { z } from "zod";
import {
  COMPONENT_POSITIONS,
  COMPONENT_TYPE_CODES,
  DAMPER_ADJUSTERS,
  SHOP_KINDS,
  SPRING_TYPES,
} from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import { COMPONENT_GROUP_LABELS, COMPONENT_TYPE_LABELS } from "@/lib/labels";
import { isSuspensionType } from "@/lib/setup";
import type { ComponentInput, SuspensionSpecsInput } from "@/lib/view-models";
import {
  componentInputSchema,
  componentSaveErrors,
  suspensionSpecsSchema,
  toComponentData,
} from "@/server/actions/component-input";
import { lastDoneOnSchema, ruleCounterStart } from "@/server/actions/rule-input";
import {
  atomically,
  createComponent,
  getBike,
  getComponent,
  listComponentTypes,
  listRuleTemplates,
  listSuspensionSpecs,
  previewWrite,
  saveSuspensionSpecs,
  updateComponent,
  type AccessContext,
  type ComponentData,
} from "@/server/db";
import { trackingStartOn } from "@/server/domain/bikes";
import { getEnv } from "@/server/env";
import { componentForm } from "@/server/views/components";
import { today } from "@/server/time";
import { addedSince, bikeUrl, describeComponent, describeNewRules, snapshot } from "../describe";
import {
  answer,
  defineTool,
  dryRunInput,
  fieldErrorsFrom,
  fieldErrorsOf,
  logWrite,
  pageInput,
  paginate,
  refused,
  ToolRefusal,
  type FieldError,
} from "../tool";

// Components (D-62) and the suspension specs of a fork or a rear shock (D-79), through the
// component sheet's own schemas. Type and position never change once a part exists.

const date = (what: string) => z.string().describe(`${what}, YYYY-MM-DD.`);
const RENAME = { templateIds: "rules" };

export const shopInput = z
  .strictObject({
    name: z
      .string()
      .describe(
        "Shop name. Matched against the workspace's shops ignoring case, accents and spaces; a new name creates the shop.",
      ),
    kind: z
      .enum(SHOP_KINDS)
      .optional()
      .describe("physical (default) or online. Used only when the shop is new."),
  })
  .describe("Where it was bought.");

const clicksInput = z
  .number()
  .nullable()
  .optional()
  .describe("Clicks from fully closed to fully open (integer > 0); null: no such adjuster.");

const maxClicksInput = z
  .strictObject({
    low_speed_rebound: clicksInput,
    high_speed_rebound: clicksInput,
    low_speed_compression: clicksInput,
    high_speed_compression: clicksInput,
  })
  .describe(
    "The damper adjusters the part has (LSR, HSR, LSC, HSC), each with its number of clicks from fully closed to fully open. Leave out the ones it does not have.",
  );

const suspensionFields = {
  spring_type: z
    .enum(SPRING_TYPES)
    .describe("air: an air spring, set by its pressure (psi); coil: a coil spring (lb/in)."),
  travel_mm: z
    .number()
    .nullable()
    .optional()
    .describe(
      "Millimetres, > 0. A fork: its travel. A rear shock: its stroke (230 × 65 → 65), never the wheel travel. The sag is measured on it.",
    ),
  wheel_travel_mm: z
    .number()
    .nullable()
    .optional()
    .describe("Rear shock only: the bike's rear wheel travel, millimetres."),
  max_clicks: maxClicksInput.optional(),
};

const suspensionInput = z
  .strictObject(suspensionFields)
  .describe("Fork or rear shock only: what the part is (spring, travel, adjusters).");

/** The fields of a part, shared by `add_component` and `create_bike`'s `components`. */
export const componentInput = z.strictObject({
  type_code: z
    .enum(COMPONENT_TYPE_CODES)
    .describe("The part's type; list_component_types gives each code's meaning and positions."),
  position: z
    .enum(COMPONENT_POSITIONS)
    .optional()
    .describe(
      "front or rear for the types that exist on both ends (brake, brake_pads, rotor, wheel, tire, hub_bearings): one part per end. Omit (none) for the others.",
    ),
  brand: z.string().nullable().optional().describe('"Fox", "Shimano". Brand or model required.'),
  model: z
    .string()
    .nullable()
    .optional()
    .describe('"36 Factory Grip2", "XT M8100". Brand or model required.'),
  reference: z.string().nullable().optional().describe("Manufacturer part number or SKU."),
  origin: z
    .enum(["stock", "upgrade"])
    .optional()
    .describe(
      "stock (default): part of the bike as bought, the original spec. upgrade: added later or to improve on it.",
    ),
  installed_on: date("Day it was fitted, not in the future")
    .optional()
    .describe(
      "Day it was fitted, YYYY-MM-DD, not in the future. Default: the bike's purchase day (else the day it was added) for a stock part, today for an upgrade.",
    ),
  initial_distance_m: z
    .number()
    .optional()
    .describe("Metres ridden on it before it was fitted or tracked (integer, default 0)."),
  initial_wear_s: z
    .number()
    .optional()
    .describe("Seconds of wear before it was fitted or tracked (integer, default 0)."),
  purchased_on: date("Purchase day").nullable().optional(),
  purchase_price_cents: z
    .number()
    .nullable()
    .optional()
    .describe("Euro cents, integer (59 € → 5900). Informative only."),
  shop: shopInput.nullable().optional(),
  warranty_ends_on: date("Last day covered by the warranty").nullable().optional(),
  notes: z.string().nullable().optional(),
  suspension: suspensionInput.nullable().optional(),
  rules: z
    .array(
      z.strictObject({
        template_id: z
          .number()
          .describe("A rule template of the part's type (list_component_types)."),
        last_done_on: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Day this maintenance was last done, YYYY-MM-DD, not in the future: the rule counts from the end of that day. Omitted: it counts from the part's fitting day (a stock part: the bike's purchase day), so a day-based rule of an old part starts overdue. Ask the owner; today if they do not know.",
          ),
      }),
    )
    .optional()
    .describe(
      "Maintenance rules to create for this part, from its type's templates. Omitted: every template of its type, counting from the fitting day, as the app proposes. []: none. The dry run gives each rule's status: ask the owner for last_done_on when one would start overdue or due soon.",
    ),
});

export type ComponentArgs = z.output<typeof componentInput>;

/** What a part needs to be written, once its input is valid. */
export type PreparedComponent = {
  slot: Pick<ComponentInput, "typeCode" | "position">;
  data: ComponentData;
  templateIds: number[];
  /** Per template, where its rule's counter starts (the end of its last done day). */
  ruleCounterStarts: Map<number, number>;
  warnings: string[];
};

type Clock = { today: LocalDate; now: number; timeZone: string };

function clock(): Clock {
  return { today: today(), now: Date.now(), timeZone: getEnv().timeZone };
}

function suspensionData(suspension: ComponentArgs["suspension"]): SuspensionSpecsInput | null {
  if (suspension == null) return null;
  const clicks = suspension.max_clicks;
  return {
    springType: suspension.spring_type,
    travelMm: suspension.travel_mm ?? null,
    wheelTravelMm: suspension.wheel_travel_mm ?? null,
    maxClicks: {
      low_speed_rebound: clicks?.low_speed_rebound ?? null,
      high_speed_rebound: clicks?.high_speed_rebound ?? null,
      low_speed_compression: clicks?.low_speed_compression ?? null,
      high_speed_compression: clicks?.high_speed_compression ?? null,
    },
  };
}

/**
 * Validates one part with the component sheet's schema; the defaults are the sheet's (stock,
 * fitted from the bike's tracking start, every rule template of its type). `prefix` names the
 * part in the errors (`components[2]`).
 */
export function prepareComponent(
  ctx: AccessContext,
  args: ComponentArgs,
  bike: { trackingStartOn: LocalDate },
  time: Clock,
  prefix = "",
): { ok: true; part: PreparedComponent } | { ok: false; errors: FieldError[] } {
  const field = (name: string) => (prefix ? `${prefix}.${name}` : name);
  const origin = args.origin ?? "stock";
  // No position for a type that has none; a missing one for a front/rear type is the form's error.
  const hasPosition = listComponentTypes().some(
    (type) => type.code === args.type_code && type.hasPosition,
  );
  const templates = listRuleTemplates(ctx, args.type_code).map((template) => template.id);
  const rules = args.rules ?? templates.map((id) => ({ template_id: id, last_done_on: null }));
  const templateIds = rules.map((rule) => rule.template_id);
  const errors: FieldError[] = [];
  // The "Règles" sheet's own check of a last done day, and where the counter then starts.
  const ruleCounterStarts = new Map<number, number>();
  rules.forEach((rule, index) => {
    const path = `${field("rules")}[${index}]`;
    if (!templates.includes(rule.template_id)) {
      errors.push({
        field: `${path}.template_id`,
        message: `Modèle de règle inconnu pour ce type de pièce : ${rule.template_id}.`,
      });
    }
    if (rule.last_done_on == null) return;
    const day = lastDoneOnSchema(time.today).safeParse(rule.last_done_on);
    if (!day.success) errors.push(...fieldErrorsOf(day.error.issues, `${path}.last_done_on`));
    else ruleCounterStarts.set(rule.template_id, ruleCounterStart(day.data, 0, time.timeZone));
  });

  const parsed = componentInputSchema(time.today).safeParse({
    templateIds,
    typeCode: args.type_code,
    position: args.position ?? (hasPosition ? undefined : "none"),
    brand: args.brand ?? null,
    model: args.model ?? null,
    reference: args.reference ?? null,
    origin,
    installedOn: args.installed_on ?? (origin === "stock" ? bike.trackingStartOn : time.today),
    initialDistanceM: args.initial_distance_m ?? 0,
    initialWearS: args.initial_wear_s ?? 0,
    purchasedOn: args.purchased_on ?? null,
    purchasePriceCents: args.purchase_price_cents ?? null,
    shop: args.shop ? { name: args.shop.name, kind: args.shop.kind ?? "physical" } : null,
    warrantyEndsOn: args.warranty_ends_on ?? null,
    notes: args.notes ?? null,
    suspension: suspensionData(args.suspension),
  } satisfies Omit<ComponentInput, "position"> & { position: unknown });
  if (!parsed.success) errors.push(...fieldErrorsOf(parsed.error.issues, prefix, RENAME));
  if (!parsed.success || errors.length > 0) return { ok: false, errors };
  const warnings =
    args.suspension && !isSuspensionType(args.type_code)
      ? [
          `${field("suspension")} ignored: only a fork or a rear shock has suspension specs (set_suspension_specs).`,
        ]
      : [];
  return {
    ok: true,
    part: {
      slot: { typeCode: parsed.data.typeCode, position: parsed.data.position },
      data: toComponentData(parsed.data, time.now, time.timeZone),
      templateIds: parsed.data.templateIds ?? [],
      ruleCounterStarts,
      warnings,
    },
  };
}

/** Writes a prepared part; a refusal (slot taken, wrong position…) throws, undoing the write. */
export function writeComponent(
  ctx: AccessContext,
  bikeId: number,
  part: PreparedComponent,
  prefix = "",
): number {
  const outcome = createComponent(
    ctx,
    bikeId,
    part.slot,
    part.data,
    part.templateIds,
    part.ruleCounterStarts,
  );
  if (outcome.ok) return outcome.componentId;
  const refusal = componentSaveErrors(outcome, part.slot, "Vélo introuvable.");
  throw new ToolRefusal(
    "error" in refusal
      ? [{ field: "bike_id", message: refusal.error }]
      : fieldErrorsFrom(refusal.fieldErrors, prefix, RENAME),
  );
}

function specsOf(ctx: AccessContext, bikeId: number, componentId: number) {
  return listSuspensionSpecs(ctx, bikeId).find((specs) => specs.componentId === componentId);
}

const notFound = (field: string, message: string) =>
  refused([{ field, message }], `${message} (${field})`);

// --- Tools ---------------------------------------------------------------------------------------

const listComponentTypesTool = defineTool({
  name: "list_component_types",
  title: "Types de pièces",
  kind: "read",
  description:
    "The component types of Bike-Book: code (English, for type_code), French label, group, the positions it takes, whether it takes suspension specs, and the maintenance rule templates add_component offers for it (intervals in metres, seconds of wear or days). Read it before adding parts.",
  input: z.strictObject(pageInput),
  run: (ctx, page) => {
    const templates = listRuleTemplates(ctx);
    const types = listComponentTypes().sort(
      (a, b) => COMPONENT_TYPE_CODES.indexOf(a.code) - COMPONENT_TYPE_CODES.indexOf(b.code),
    );
    const { items, next_cursor } = paginate(types, (type) => type.code, page);
    return answer(`${items.length} of ${types.length} component types.`, {
      component_types: items.map((type) => ({
        code: type.code,
        label: COMPONENT_TYPE_LABELS[type.code],
        group: type.componentGroup,
        group_label: COMPONENT_GROUP_LABELS[type.componentGroup],
        positions: type.hasPosition ? ["front", "rear"] : ["none"],
        single_slot: type.singleSlot,
        takes_suspension_specs: isSuspensionType(type.code),
        rule_templates: templates
          .filter((template) => template.componentTypeCode === type.code)
          .map((template) => ({
            id: template.id,
            code: template.code,
            title: template.title,
            interval_distance_m: template.intervalDistanceM,
            interval_wear_s: template.intervalWearS,
            interval_days: template.intervalDays,
            source: template.source,
            evidence_level: template.evidenceLevel,
            notes: template.notes,
          })),
      })),
      next_cursor,
    });
  },
});

const addComponentTool = defineTool({
  name: "add_component",
  title: "Ajouter une pièce",
  kind: "write",
  description:
    "Adds a part to an existing bike: an original part (origin stock) or one added later (upgrade), with its suspension specs for a fork or a rear shock, and the maintenance rules of its type. One part per slot (type and position): a part already fitted there is refused (replacing a part is done in the app). Units: metres, seconds, euro cents, dates YYYY-MM-DD. Call with dry_run true first.",
  input: componentInput.extend({
    bike_id: z.number().describe("The bike (list_bikes)."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { bike_id: bikeId, dry_run: dryRun, ...args }) => {
    const bike = getBike(ctx, bikeId);
    if (!bike) return notFound("bike_id", "Vélo introuvable.");
    const at = clock();
    const prepared = prepareComponent(
      ctx,
      args,
      { trackingStartOn: trackingStartOn(bike, at.timeZone) },
      at,
    );
    if (!prepared.ok) return refused(prepared.errors, "The part was refused; nothing was written.");
    const { part } = prepared;
    const ids = dryRun ? "none" : "real";

    const write = () => {
      const before = snapshot(ctx, bikeId);
      const componentId = writeComponent(ctx, bikeId, part);
      const added = addedSince(ctx, bikeId, before);
      const component = getComponent(ctx, componentId)!;
      return {
        componentId,
        added,
        rules: describeNewRules(ctx, bikeId, added.rules, ids),
        component: describeComponent(component, specsOf(ctx, bikeId, componentId), ids),
      };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) {
      logWrite(ctx, "add_component", {
        component_id: result.componentId,
        rule_ids: result.added.rules.map((rule) => rule.id),
        shop_ids: result.added.shops.map((shop) => shop.id),
      });
    }
    const label = result.component.label;
    return answer(
      dryRun
        ? `Dry run: would add ${label} to ${bike.name}, with ${result.added.rules.length} rule(s). Nothing was written.`
        : `Added ${label} (component ${result.componentId}) to ${bike.name}, with ${result.added.rules.length} rule(s).`,
      {
        dry_run: dryRun,
        component: result.component,
        rules_created: result.rules.rules,
        shops_created: result.added.shops.map((shop) => shop.name),
        warnings: [...part.warnings, ...result.rules.warnings],
        bike_url: bikeUrl(bikeId),
      },
    );
  },
});

const updateComponentTool = defineTool({
  name: "update_component",
  title: "Modifier une pièce",
  kind: "write",
  description:
    "Changes a part's details: only the fields given change (null clears an optional field). Its type and position never change; a part fitted by a replacement keeps its origin and fitting date. Suspension specs: set_suspension_specs. Units: metres, seconds, euro cents, dates YYYY-MM-DD. Call with dry_run true first.",
  input: componentInput
    .omit({ type_code: true, position: true, suspension: true, rules: true })
    .extend({
      component_id: z.number().describe("The part (get_bike lists a bike's parts)."),
      dry_run: dryRunInput,
    }),
  run: (ctx, { component_id: componentId, dry_run: dryRun, ...patch }) => {
    const current = getComponent(ctx, componentId);
    if (!current) return notFound("component_id", "Pièce introuvable.");
    const at = clock();
    // The sheet's current values; the schema drops its extra keys (id, fromReplacement).
    const form = componentForm(current, at.timeZone);
    const given = <K extends keyof typeof patch>(key: K) => patch[key] !== undefined;
    const input: ComponentInput = {
      ...form,
      origin: form.origin === "stock" ? "stock" : "upgrade",
      brand: given("brand") ? (patch.brand ?? null) : form.brand,
      model: given("model") ? (patch.model ?? null) : form.model,
      reference: given("reference") ? (patch.reference ?? null) : form.reference,
      installedOn: patch.installed_on ?? form.installedOn,
      initialDistanceM: patch.initial_distance_m ?? form.initialDistanceM,
      initialWearS: patch.initial_wear_s ?? form.initialWearS,
      purchasedOn: given("purchased_on") ? (patch.purchased_on ?? null) : form.purchasedOn,
      purchasePriceCents: given("purchase_price_cents")
        ? (patch.purchase_price_cents ?? null)
        : form.purchasePriceCents,
      shop: given("shop")
        ? patch.shop
          ? { name: patch.shop.name, kind: patch.shop.kind ?? "physical" }
          : null
        : form.shop,
      warrantyEndsOn: given("warranty_ends_on")
        ? (patch.warranty_ends_on ?? null)
        : form.warrantyEndsOn,
      notes: given("notes") ? (patch.notes ?? null) : form.notes,
      suspension: null,
    };
    if (patch.origin) input.origin = patch.origin;
    const parsed = componentInputSchema(at.today).safeParse(input);
    if (!parsed.success) {
      return refused(
        fieldErrorsOf(parsed.error.issues, "", RENAME),
        "The change was refused; nothing was written.",
      );
    }
    const data: ComponentData = {
      ...toComponentData(parsed.data, at.now, at.timeZone),
      // Specs are set_suspension_specs' job; the fitting instant stays when it is not changed.
      suspension: undefined,
      ...(given("installed_on") || given("origin") ? {} : { installedAt: current.installedAt }),
    };
    const warnings =
      form.fromReplacement && (given("origin") || given("installed_on"))
        ? [
            "This part was fitted by a replacement: its origin and fitting date follow the replacement and were not changed.",
          ]
        : [];
    const write = () => {
      const before = snapshot(ctx, current.bikeId);
      const outcome = updateComponent(ctx, current.id, data);
      if (!outcome.ok) {
        const refusal = componentSaveErrors(outcome, current, "Pièce introuvable.");
        throw new ToolRefusal(
          "error" in refusal
            ? [{ field: "component_id", message: refusal.error }]
            : fieldErrorsFrom(refusal.fieldErrors, "", RENAME),
        );
      }
      return {
        added: addedSince(ctx, current.bikeId, before),
        // An existing part: its id is real even in a dry run.
        component: describeComponent(
          getComponent(ctx, current.id)!,
          specsOf(ctx, current.bikeId, current.id),
        ),
      };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) {
      logWrite(ctx, "update_component", {
        component_id: current.id,
        shop_ids: result.added.shops.map((shop) => shop.id),
      });
    }
    return answer(
      dryRun
        ? `Dry run: ${result.component.label} would be saved as shown. Nothing was written.`
        : `Saved ${result.component.label} (component ${current.id}).`,
      {
        dry_run: dryRun,
        component: result.component,
        shops_created: result.added.shops.map((shop) => shop.name),
        warnings,
        bike_url: bikeUrl(current.bikeId),
      },
    );
  },
});

const setSuspensionSpecsTool = defineTool({
  name: "set_suspension_specs",
  title: "Décrire une fourche ou un amortisseur",
  kind: "write",
  description:
    "Describes a fork or a rear shock for its setup: spring type, travel (a shock's stroke), rear wheel travel (shock only), and the clicks of each damper adjuster from fully closed to fully open. Fields left out keep their current value; null clears one (an adjuster the part does not have). Call with dry_run true first.",
  input: z.strictObject({
    component_id: z.number().describe("The fork or rear shock (get_bike)."),
    spring_type: suspensionFields.spring_type
      .optional()
      .describe("air or coil. Required when the part has no specs yet."),
    travel_mm: suspensionFields.travel_mm,
    wheel_travel_mm: suspensionFields.wheel_travel_mm,
    max_clicks: maxClicksInput.optional(),
    dry_run: dryRunInput,
  }),
  run: (ctx, args) => {
    const current = getComponent(ctx, args.component_id);
    if (!current) return notFound("component_id", "Pièce introuvable.");
    if (!isSuspensionType(current.typeCode)) {
      return notFound(
        "component_id",
        "Seule une fourche ou un amortisseur a des données de suspension.",
      );
    }
    const existing = specsOf(ctx, current.bikeId, current.id);
    const pick = <T>(value: T | undefined, fallback: T) => (value === undefined ? fallback : value);
    const parsed = suspensionSpecsSchema.safeParse({
      springType: args.spring_type ?? existing?.springType,
      travelMm: pick(args.travel_mm, existing?.travelMm ?? null),
      wheelTravelMm: pick(args.wheel_travel_mm, existing?.wheelTravelMm ?? null),
      maxClicks: Object.fromEntries(
        DAMPER_ADJUSTERS.map((adjuster) => [
          adjuster,
          pick(args.max_clicks?.[adjuster], existing?.maxClicks[adjuster] ?? null),
        ]),
      ),
    });
    if (!parsed.success) {
      return refused(
        fieldErrorsOf(parsed.error.issues),
        "The specs were refused; nothing was written.",
      );
    }
    const write = () => {
      if (!saveSuspensionSpecs(ctx, current.id, parsed.data)) {
        throw new ToolRefusal([{ field: "component_id", message: "Pièce introuvable." }]);
      }
      return describeComponent(
        getComponent(ctx, current.id)!,
        specsOf(ctx, current.bikeId, current.id),
      );
    };
    const component = args.dry_run ? previewWrite(write) : atomically(write);
    if (!args.dry_run) logWrite(ctx, "set_suspension_specs", { component_id: current.id });
    return answer(
      args.dry_run
        ? `Dry run: ${component.label} would be described as shown. Nothing was written.`
        : `Saved the suspension specs of ${component.label} (component ${current.id}).`,
      {
        dry_run: args.dry_run,
        component,
        warnings:
          current.typeCode === "fork" && parsed.data.wheelTravelMm != null
            ? ["wheel_travel_mm is meant for a rear shock; it is stored but not shown for a fork."]
            : [],
        bike_url: bikeUrl(current.bikeId),
      },
    );
  },
});

export const componentTools = [
  listComponentTypesTool,
  addComponentTool,
  updateComponentTool,
  setSuspensionSpecsTool,
];
