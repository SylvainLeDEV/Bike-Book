import "server-only";
import { z } from "zod";
import { DAMPER_ADJUSTERS } from "@/lib/enums";
import { roundedSagPercent, setupPrefill } from "@/lib/setup";
import type { SetupInput, SuspensionValuesInput } from "@/lib/view-models";
import { parseSetupInput } from "@/server/actions/setup-input";
import {
  atomically,
  createSetup,
  deleteSetup,
  getSetupBikeId,
  getBike,
  listComponents,
  listSetups,
  listSuspensionSpecs,
  previewWrite,
  updateSetup,
  type AccessContext,
  type Component,
  type Setup,
} from "@/server/db";
import { setupChanges } from "@/server/domain/setups";
import { today } from "@/server/time";
import { SUSPENSION_DISCIPLINES } from "@/server/views/bikes";
import { setupTab, toSpecsInput } from "@/server/views/setups";
import { bikeUrl, type Ids } from "../describe";
import {
  answer,
  defineTool,
  dryRunInput,
  logWrite,
  pageInput,
  paginate,
  refused,
  ToolRefusal,
  type FieldError,
} from "../tool";

// The setup log of the "Réglages" tab (D-24, D-79) through the MCP (D-95): tyre pressures and
// the fork's and rear shock's values, each setup a dated full copy. A new setup starts from the
// current one, as "Nouveau réglage" does; the part's specs (clicks, travel) bound its values.

const REFUSED = "The setup was refused; nothing was written.";

const snakeCase = (key: string) => key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);

function toInput(setup: Setup): SetupInput {
  const { setOn, label, notes, tireFrontPressureBar, tireRearPressureBar, suspensions } = setup;
  return { setOn, label, notes, tireFrontPressureBar, tireRearPressureBar, suspensions };
}

type Context = { components: Map<number, Component>; travel: Map<number, number | null> };

function describeValues(values: SuspensionValuesInput, context: Context) {
  const part = context.components.get(values.componentId);
  const travel = context.travel.get(values.componentId) ?? null;
  return {
    component_id: values.componentId,
    type_code: part?.typeCode ?? null,
    name: part ? [part.brand, part.model].filter(Boolean).join(" ") || null : null,
    air_pressure_psi: values.airPressurePsi,
    spring_rate_lb_per_in: values.springRateLbPerIn,
    volume_spacers: values.volumeSpacers,
    sag_mm: values.sagMm,
    /** Of the travel the sag is measured on (a fork's travel, a shock's stroke). */
    sag_percent: values.sagMm == null ? null : roundedSagPercent(values.sagMm, travel),
    sag_target_percent: values.sagTargetPercent,
    /** Clicks from fully closed. */
    clicks: { ...values.clicks },
  };
}

function describeSetup(
  setup: SetupInput,
  previous: SetupInput | null,
  context: Context,
  id: number | null,
) {
  return {
    id,
    set_on: setup.setOn,
    label: setup.label,
    notes: setup.notes,
    tire_front_pressure_bar: setup.tireFrontPressureBar,
    tire_rear_pressure_bar: setup.tireRearPressureBar,
    suspensions: setup.suspensions.map((values) => describeValues(values, context)),
    /** What differs from the setup before it (every value, for the first one). */
    changes: setupChanges(previous, setup).map((change) => ({
      component_id: change.componentId,
      field: (DAMPER_ADJUSTERS as readonly string[]).includes(change.field)
        ? `clicks.${change.field}`
        : snakeCase(change.field),
      from: change.from,
      to: change.to,
    })),
  };
}

function loadSetups(ctx: AccessContext, bikeId: number) {
  const bike = getBike(ctx, bikeId);
  if (!bike) return null;
  const components = listComponents(ctx, bikeId);
  const specs = listSuspensionSpecs(ctx, bikeId);
  const setups = listSetups(ctx, bikeId);
  const tab = setupTab(components, specs, setups, SUSPENSION_DISCIPLINES.includes(bike.discipline));
  const context: Context = {
    components: new Map(components.map((c) => [c.id, c])),
    travel: new Map(specs.map((s) => [s.componentId, s.travelMm])),
  };
  return { bike, specs, setups, units: tab.units, context };
}

// --- list_setups ---------------------------------------------------------------------------------

const listSetupsTool = defineTool({
  name: "list_setups",
  title: "Réglages d'un vélo",
  kind: "read",
  description:
    "A bike's setup log (the \"Réglages\" tab), newest first: each setup's day, name, tyre pressures (bar), and for the fork and the rear shock: air pressure (psi) or spring rate (lb/in), volume spacers, sag (mm and percent of the travel), sag aimed for (percent), clicks from fully closed per adjuster; and what changed from the setup before it. The first is the current setup. suspension_units: the fork and shock fitted now, with their specs (travel, adjusters and their clicks).",
  input: z.strictObject({ bike_id: z.number().describe("The bike (list_bikes)."), ...pageInput }),
  run: (ctx, { bike_id: bikeId, ...page }) => {
    const loaded = loadSetups(ctx, bikeId);
    if (!loaded)
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    const { setups, units, context } = loaded;
    const { items, next_cursor } = paginate(setups, (s) => String(s.id), page);
    return answer(`${items.length} of ${setups.length} setups.`, {
      setups: items.map((setup) => {
        const index = setups.indexOf(setup);
        const previous = setups[index + 1] ? toInput(setups[index + 1]!) : null;
        return describeSetup(toInput(setup), previous, context, setup.id);
      }),
      next_cursor,
      suspension_units: units.map((unit) => ({
        component_id: unit.componentId,
        type_code: unit.typeCode,
        name: unit.name,
        travel_mm: unit.specs?.travelMm ?? null,
        spring_type: unit.specs?.springType ?? null,
        max_clicks: unit.specs ? { ...unit.specs.maxClicks } : null,
      })),
      bike_url: `${bikeUrl(bikeId)}?tab=setup`,
    });
  },
});

// --- add_setup -----------------------------------------------------------------------------------

const clicksInput = z.number().nullable().optional();

const suspensionInput = z
  .strictObject({
    air_pressure_psi: z.number().nullable().optional().describe("Air spring: pressure, psi."),
    spring_rate_lb_per_in: z.number().nullable().optional().describe("Coil spring: rate, lb/in."),
    volume_spacers: z.number().nullable().optional().describe("Tokens, 0 to 20."),
    sag_mm: z.number().nullable().optional().describe("Sag measured, mm."),
    sag_target_percent: z.number().nullable().optional().describe("Sag aimed for, percent."),
    clicks: z
      .strictObject({
        low_speed_rebound: clicksInput,
        high_speed_rebound: clicksInput,
        low_speed_compression: clicksInput,
        high_speed_compression: clicksInput,
      })
      .optional()
      .describe("Clicks from fully closed, per adjuster the part has."),
  })
  .describe("Only the values that change; the others keep the current setup's.");

type SuspensionArgs = z.output<typeof suspensionInput>;

/** The sheet's errors (`<componentId>.<field>`) as the tool's fields (`fork.clicks.…`). */
function setupErrors(
  fieldErrors: Partial<Record<string, string>>,
  fieldOf: Map<number, "fork" | "rear_shock">,
): FieldError[] {
  return Object.entries(fieldErrors).flatMap(([key, message]) => {
    if (!message) return [];
    const [first, field] = key.split(".");
    const unit = fieldOf.get(Number(first));
    if (!unit || !field) return [{ field: snakeCase(first!), message }];
    const name = (DAMPER_ADJUSTERS as readonly string[]).includes(field)
      ? `clicks.${field}`
      : snakeCase(field);
    return [{ field: `${unit}.${name}`, message }];
  });
}

function merged(base: SuspensionValuesInput, args: SuspensionArgs): SuspensionValuesInput {
  const pick = <T>(value: T | undefined, current: T) => (value === undefined ? current : value);
  return {
    componentId: base.componentId,
    airPressurePsi: pick(args.air_pressure_psi, base.airPressurePsi),
    springRateLbPerIn: pick(args.spring_rate_lb_per_in, base.springRateLbPerIn),
    volumeSpacers: pick(args.volume_spacers, base.volumeSpacers),
    sagMm: pick(args.sag_mm, base.sagMm),
    sagTargetPercent: pick(args.sag_target_percent, base.sagTargetPercent),
    clicks: Object.fromEntries(
      DAMPER_ADJUSTERS.map((a) => [a, pick(args.clicks?.[a], base.clicks[a])]),
    ) as SuspensionValuesInput["clicks"],
  };
}

const addSetupTool = defineTool({
  name: "add_setup",
  title: "Nouveau réglage",
  kind: "write",
  description:
    "Adds a setup to a bike's log, as \"Nouveau réglage\": it starts from the current setup, and only the values given change (null clears one). fork and rear_shock are the parts fitted now (list_setups, suspension_units); clicks are counted from fully closed and bounded by the part's specs (set_suspension_specs). Tyre pressures in bar. The answer lists what changed from the current setup. Call with dry_run true first.",
  input: z.strictObject({
    bike_id: z.number().describe("The bike (list_bikes)."),
    set_on: z.string().optional().describe("Day, YYYY-MM-DD, not in the future (default today)."),
    label: z.string().nullable().optional().describe('A name: "Bike park", "Hiver".'),
    notes: z.string().nullable().optional(),
    tire_front_pressure_bar: z.number().nullable().optional(),
    tire_rear_pressure_bar: z.number().nullable().optional(),
    fork: suspensionInput.optional(),
    rear_shock: suspensionInput.optional(),
    dry_run: dryRunInput,
  }),
  run: (ctx, { bike_id: bikeId, dry_run: dryRun, ...args }) => {
    const loaded = loadSetups(ctx, bikeId);
    if (!loaded)
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    const { setups, units, specs, context } = loaded;
    const current = setups[0] ? toInput(setups[0]) : null;
    const day = args.set_on ?? today();
    const { values } = setupPrefill(units, current, day);

    const errors: FieldError[] = [];
    const fieldOf = new Map<number, "fork" | "rear_shock">();
    for (const type of ["fork", "rear_shock"] as const) {
      const unit = units.find((u) => u.typeCode === type);
      if (unit) fieldOf.set(unit.componentId, type);
      const given = args[type];
      if (!given) continue;
      if (!unit) {
        errors.push({
          field: type,
          message:
            type === "fork"
              ? "Pas de fourche suspendue sur ce vélo (décris-la avec set_suspension_specs)."
              : "Pas d'amortisseur sur ce vélo.",
        });
        continue;
      }
      const index = values.suspensions.findIndex((v) => v.componentId === unit.componentId);
      values.suspensions[index] = merged(values.suspensions[index]!, given);
    }
    if (errors.length) return refused(errors, REFUSED);
    const pick = <T>(value: T | undefined, base: T) => (value === undefined ? base : value);
    const input: SetupInput = {
      ...values,
      label: args.label ?? null,
      notes: args.notes ?? null,
      tireFrontPressureBar: pick(args.tire_front_pressure_bar, values.tireFrontPressureBar),
      tireRearPressureBar: pick(args.tire_rear_pressure_bar, values.tireRearPressureBar),
    };

    const specsById = new Map(specs.map((s) => [s.componentId, s]));
    const parsed = parseSetupInput(input, today(), (id) => toSpecsInput(specsById.get(id)));
    if (!parsed.success) return refused(setupErrors(parsed.fieldErrors, fieldOf), REFUSED);
    const data = parsed.data;
    const ids: Ids = dryRun ? "none" : "real";
    const write = () => {
      const outcome = createSetup(ctx, bikeId, data);
      if (!outcome.ok) {
        throw new ToolRefusal([{ field: "bike_id", message: "Vélo introuvable." }], REFUSED);
      }
      return outcome.setupId;
    };
    const setupId = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "add_setup", { setup_id: setupId });
    // The current setup is the newest by day: one dated before it is filed in the past.
    const previous = setups.find((s) => s.setOn <= data.setOn) ?? null;
    const described = describeSetup(
      data,
      previous ? toInput(previous) : null,
      context,
      ids === "real" ? setupId : null,
    );
    const filedBefore = current != null && data.setOn < current.setOn;
    return answer(
      dryRun
        ? `Dry run: would add a setup on ${data.setOn} (${described.changes.length} change(s)). Nothing was written.`
        : `Added setup ${setupId} on ${data.setOn}.`,
      {
        dry_run: dryRun,
        setup: described,
        warnings: [
          ...(filedBefore
            ? [
                `It is dated before the current setup (${current!.setOn}): it is filed in the past and does not become the current one.`,
              ]
            : []),
          ...(described.changes.length === 0 ? ["Nothing differs from the setup before it."] : []),
        ],
        bike_url: `${bikeUrl(bikeId)}?tab=setup`,
      },
    );
  },
});

// --- update_setup and delete_setup ---------------------------------------------------------------

function findSetup(ctx: AccessContext, setupId: number) {
  const bikeId = getSetupBikeId(ctx, setupId);
  if (bikeId == null) return null;
  const loaded = loadSetups(ctx, bikeId)!;
  const index = loaded.setups.findIndex((s) => s.id === setupId);
  return { ...loaded, setup: loaded.setups[index]!, previous: loaded.setups[index + 1] ?? null };
}

const updateSetupTool = defineTool({
  name: "update_setup",
  title: "Modifier un réglage",
  kind: "write",
  description:
    'Corrects a setup of the log, as "Modifier le réglage": only the values given change (null clears one), on the parts that setup holds. To record a new state of the bike, add_setup instead. Call with dry_run true first.',
  input: z.strictObject({
    setup_id: z.number().describe("The setup (list_setups)."),
    set_on: z.string().optional(),
    label: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    tire_front_pressure_bar: z.number().nullable().optional(),
    tire_rear_pressure_bar: z.number().nullable().optional(),
    fork: suspensionInput.optional(),
    rear_shock: suspensionInput.optional(),
    dry_run: dryRunInput,
  }),
  run: (ctx, { setup_id: setupId, dry_run: dryRun, ...args }) => {
    const found = findSetup(ctx, setupId);
    if (!found) {
      return refused([{ field: "setup_id", message: "Réglage introuvable." }], "Unknown setup.");
    }
    const { setup, previous, specs, context, bike } = found;
    const values = toInput(setup);
    const fieldOf = new Map<number, "fork" | "rear_shock">();
    const errors: FieldError[] = [];
    for (const type of ["fork", "rear_shock"] as const) {
      const index = values.suspensions.findIndex(
        (v) => context.components.get(v.componentId)?.typeCode === type,
      );
      if (index >= 0) fieldOf.set(values.suspensions[index]!.componentId, type);
      const given = args[type];
      if (!given) continue;
      if (index < 0) {
        errors.push({
          field: type,
          message:
            type === "fork"
              ? "Ce réglage n'a pas de fourche."
              : "Ce réglage n'a pas d'amortisseur.",
        });
        continue;
      }
      values.suspensions[index] = merged(values.suspensions[index]!, given);
    }
    if (errors.length) return refused(errors, REFUSED);
    const pick = <T>(value: T | undefined, base: T) => (value === undefined ? base : value);
    const input: SetupInput = {
      ...values,
      setOn: args.set_on ?? values.setOn,
      label: pick(args.label, values.label),
      notes: pick(args.notes, values.notes),
      tireFrontPressureBar: pick(args.tire_front_pressure_bar, values.tireFrontPressureBar),
      tireRearPressureBar: pick(args.tire_rear_pressure_bar, values.tireRearPressureBar),
    };
    const specsById = new Map(specs.map((s) => [s.componentId, s]));
    const parsed = parseSetupInput(input, today(), (id) => toSpecsInput(specsById.get(id)));
    if (!parsed.success) return refused(setupErrors(parsed.fieldErrors, fieldOf), REFUSED);
    const data = parsed.data;
    const write = () => {
      if (!updateSetup(ctx, setupId, data).ok) {
        throw new ToolRefusal([{ field: "setup_id", message: "Réglage introuvable." }], REFUSED);
      }
    };
    if (dryRun) previewWrite(write);
    else {
      atomically(write);
      logWrite(ctx, "update_setup", { setup_id: setupId });
    }
    return answer(
      dryRun
        ? `Dry run: would correct the setup of ${data.setOn}. Nothing was written.`
        : `Corrected the setup of ${data.setOn}.`,
      {
        dry_run: dryRun,
        setup: describeSetup(data, previous ? toInput(previous) : null, context, setupId),
        before: describeSetup(
          toInput(setup),
          previous ? toInput(previous) : null,
          context,
          setupId,
        ),
        warnings: [],
        bike_url: `${bikeUrl(bike.id)}?tab=setup`,
      },
    );
  },
});

const deleteSetupTool = defineTool({
  name: "delete_setup",
  title: "Supprimer un réglage",
  kind: "delete",
  description:
    'Deletes a setup of the log, as "Supprimer ce réglage": a mistake, for good. If it was the current one, the one before becomes current. The dry run says what would go; delete only once the owner has confirmed.',
  input: z.strictObject({
    setup_id: z.number().describe("The setup (list_setups)."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { setup_id: setupId, dry_run: dryRun }) => {
    const found = findSetup(ctx, setupId);
    if (!found) {
      return refused([{ field: "setup_id", message: "Réglage introuvable." }], "Unknown setup.");
    }
    const { setup, previous, context, setups } = found;
    const described = describeSetup(
      toInput(setup),
      previous ? toInput(previous) : null,
      context,
      setupId,
    );
    const wasCurrent = setups[0]?.id === setupId;
    const write = () => {
      if (!deleteSetup(ctx, setupId)) {
        throw new ToolRefusal([{ field: "setup_id", message: "Réglage introuvable." }]);
      }
    };
    if (dryRun) previewWrite(write);
    else {
      atomically(write);
      logWrite(ctx, "delete_setup", { setup_id: setupId });
    }
    return answer(
      dryRun
        ? `Dry run: would delete the setup of ${setup.setOn}. Nothing was deleted.`
        : `Deleted the setup of ${setup.setOn}.`,
      {
        dry_run: dryRun,
        deleted: described,
        warnings: wasCurrent
          ? [
              previous
                ? `It is the current setup: the one of ${previous.setOn} becomes current.`
                : "It is the bike's only setup.",
            ]
          : [],
      },
    );
  },
});

export const setupTools = [listSetupsTool, addSetupTool, updateSetupTool, deleteSetupTool];
