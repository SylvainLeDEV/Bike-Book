import "server-only";
import { z } from "zod";
import { BIKE_STATUSES, DISCIPLINES, WHEEL_SIZES } from "@/lib/enums";
import type { BikeInput } from "@/lib/view-models";
import { bikeInputSchema, bikeNameTakenMessage, toBikeData } from "@/server/actions/bike-input";
import { atomically, createBike, getBike, listBikes, previewWrite, updateBike } from "@/server/db";
import { trackingStartOn } from "@/server/domain/bikes";
import { getEnv } from "@/server/env";
import { bikeForm } from "@/server/views/bikes";
import { today } from "@/server/time";
import {
  addedSince,
  bikeSummary,
  bikeUrl,
  describeBike,
  describeNewRules,
  snapshot,
} from "../describe";
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
import { componentInput, prepareComponent, shopInput, writeComponent } from "./components";

// Bikes (D-43), through the bike sheet's own schema. The frame number (`frame_serial`) is never
// read nor written here: it stays as it is.

const date = (what: string) => z.string().describe(`${what}, YYYY-MM-DD.`);

/** The bike's fields, all optional: `create_bike` requires `name` and `discipline` on top. */
const bikeFields = {
  name: z
    .string()
    .describe('Name used in the app, unique per workspace (case and accents ignored): "Spectral".'),
  discipline: z
    .enum(DISCIPLINES)
    .describe(
      "road, gravel, xc (cross-country), trail, enduro, dh (downhill), dirt (dirt jump, pump track), city (city, commuting, touring), other.",
    ),
  is_electric: z.boolean().optional().describe("An e-bike (default false)."),
  brand: z.string().nullable().optional().describe('"Canyon".'),
  model: z.string().nullable().optional().describe('"Spectral 29 CF 8".'),
  model_year: z
    .number()
    .nullable()
    .optional()
    .describe("Model year given by the maker, 1900–2100."),
  frame_size: z.string().nullable().optional().describe('As the maker writes it: "L", "56".'),
  wheel_size: z
    .enum(WHEEL_SIZES)
    .nullable()
    .optional()
    .describe(
      "29, 27.5, 26 (both wheels, inches), mullet (29 front, 27.5 rear), 700c, 650b, other.",
    ),
  color: z.string().nullable().optional(),
  weight_g: z.number().nullable().optional().describe("Grams, integer > 0 (15,2 kg → 15200)."),
  purchased_on: date("Purchase day, not in the future").nullable().optional(),
  purchase_price_cents: z
    .number()
    .nullable()
    .optional()
    .describe("Euro cents, integer (4 299 € → 429900)."),
  shop: shopInput.nullable().optional(),
  bought_used: z.boolean().optional().describe("Bought second-hand (default false)."),
  initial_distance_m: z
    .number()
    .optional()
    .describe("Metres ridden before tracking started (second-hand bike), integer, default 0."),
  initial_wear_s: z
    .number()
    .optional()
    .describe("Seconds of riding before tracking started, integer, default 0."),
  status: z
    .enum(BIKE_STATUSES)
    .optional()
    .describe(
      "active (default, ridden), stored (put away), sold, stolen, retired. Bikes are never deleted.",
    ),
  sold_on: date("Sale day, status sold only").nullable().optional(),
  sale_price_cents: z
    .number()
    .nullable()
    .optional()
    .describe("Euro cents, integer; status sold only."),
  notes: z.string().nullable().optional(),
};

type BikeArgs = Partial<z.output<z.ZodObject<typeof bikeFields>>>;

/** The tool's fields over a base input: only the fields given change; null clears. */
function bikeInputOf(base: BikeInput, args: BikeArgs): BikeInput {
  const pick = <V>(key: keyof BikeArgs, current: V): V =>
    args[key] === undefined ? current : (args[key] as V);
  return {
    ...base,
    name: pick("name", base.name),
    discipline: pick("discipline", base.discipline),
    isElectric: pick("is_electric", base.isElectric),
    brand: pick("brand", base.brand),
    model: pick("model", base.model),
    modelYear: pick("model_year", base.modelYear),
    frameSize: pick("frame_size", base.frameSize),
    wheelSize: pick("wheel_size", base.wheelSize),
    color: pick("color", base.color),
    weightG: pick("weight_g", base.weightG),
    purchasedOn: pick("purchased_on", base.purchasedOn),
    purchasePriceCents: pick("purchase_price_cents", base.purchasePriceCents),
    shop:
      args.shop === undefined
        ? base.shop
        : args.shop && { name: args.shop.name, kind: args.shop.kind ?? "physical" },
    boughtUsed: pick("bought_used", base.boughtUsed),
    initialDistanceM: pick("initial_distance_m", base.initialDistanceM),
    initialWearS: pick("initial_wear_s", base.initialWearS),
    status: pick("status", base.status),
    soldOn: pick("sold_on", base.soldOn),
    salePriceCents: pick("sale_price_cents", base.salePriceCents),
    notes: pick("notes", base.notes),
  };
}

/** A new bike's input before the tool's fields: the sheet's defaults. */
const NEW_BIKE: BikeInput = {
  name: "",
  brand: null,
  model: null,
  modelYear: null,
  discipline: "other",
  isElectric: false,
  status: "active",
  soldOn: null,
  salePriceCents: null,
  frameSize: null,
  wheelSize: null,
  color: null,
  weightG: null,
  frameSerial: null,
  notes: null,
  purchasedOn: null,
  purchasePriceCents: null,
  shop: null,
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
};

const notFound = () =>
  refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike (bike_id).");

// --- Tools ---------------------------------------------------------------------------------------

const listBikesTool = defineTool({
  name: "list_bikes",
  title: "Liste des vélos",
  kind: "read",
  description:
    "The bikes of the owner's workspace, in the order they were added: id, name, brand, model, model year, status, link to the bike page.",
  input: z.strictObject(pageInput),
  run: (ctx, page) => {
    const bikes = listBikes(ctx);
    const { items, next_cursor } = paginate(bikes, (bike) => String(bike.id), page);
    return answer(`${items.length} of ${bikes.length} bikes.`, {
      bikes: items.map((bike) => ({ ...bikeSummary(bike), url: bikeUrl(bike.id) })),
      next_cursor,
    });
  },
});

const getBikeTool = defineTool({
  name: "get_bike",
  title: "Fiche d'un vélo",
  kind: "read",
  description:
    "One bike's record (identity, purchase, status, initial counters; never the frame number) and the parts fitted today, with the suspension specs of its fork and rear shock and the link to its page. Distances in metres, durations in seconds, money in euro cents, dates YYYY-MM-DD.",
  input: z.strictObject({ bike_id: z.number().describe("The bike (list_bikes).") }),
  run: (ctx, { bike_id: bikeId }) => {
    const bike = describeBike(ctx, bikeId);
    if (!bike) return notFound();
    return answer(`${bike.name}: ${bike.components.length} part(s) fitted. ${bike.url}`, { bike });
  },
});

const createBikeTool = defineTool({
  name: "create_bike",
  title: "Créer un vélo",
  kind: "write",
  description:
    "Creates a bike, and optionally its original parts in the same write (all or nothing): each part as in add_component, with its suspension specs and its maintenance rules. Read list_component_types first. Units: metres, seconds, grams, euro cents, dates YYYY-MM-DD. Call with dry_run true first, show the owner what would be created, then call again with dry_run false.",
  input: z.strictObject({
    ...bikeFields,
    components: z
      .array(componentInput)
      .max(40)
      .optional()
      .describe("The bike's parts, usually its original spec (origin stock)."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { components = [], dry_run: dryRun, ...args }) => {
    const day = today();
    const { timeZone } = getEnv();
    const now = Date.now();
    const parsed = bikeInputSchema(day).safeParse(bikeInputOf(NEW_BIKE, args));
    const errors: FieldError[] = parsed.success ? [] : fieldErrorsOf(parsed.error.issues);
    const start = trackingStartOn(
      { purchasedOn: parsed.success ? parsed.data.purchasedOn : null, createdAt: new Date(now) },
      timeZone,
    );
    const parts = components.flatMap((part, index) => {
      const prepared = prepareComponent(
        ctx,
        part,
        { trackingStartOn: start },
        { today: day, now, timeZone },
        `components[${index}]`,
      );
      if (prepared.ok) return [prepared.part];
      errors.push(...prepared.errors);
      return [];
    });
    if (!parsed.success || errors.length > 0) {
      return refused(errors, "The bike was refused; nothing was written. Fix the fields listed.");
    }

    const ids = dryRun ? "none" : "real";
    const write = () => {
      const before = snapshot(ctx, null);
      const outcome = createBike(ctx, toBikeData(parsed.data, null, day));
      if (!outcome.ok) {
        throw new ToolRefusal([
          {
            field: "name",
            message:
              outcome.reason === "name_taken"
                ? bikeNameTakenMessage(outcome.takenBy)
                : "Vélo introuvable.",
          },
        ]);
      }
      const componentIds = parts.map((part, index) =>
        writeComponent(ctx, outcome.bikeId, part, `components[${index}]`),
      );
      const added = addedSince(ctx, outcome.bikeId, before);
      return {
        bikeId: outcome.bikeId,
        componentIds,
        added,
        rules: describeNewRules(ctx, outcome.bikeId, added.rules, ids),
        bike: describeBike(ctx, outcome.bikeId, ids)!,
      };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) {
      logWrite(ctx, "create_bike", {
        bike_id: result.bikeId,
        component_ids: result.componentIds,
        rule_ids: result.added.rules.map((rule) => rule.id),
        shop_ids: result.added.shops.map((shop) => shop.id),
      });
    }
    const warnings = [...parts.flatMap((part) => part.warnings), ...result.rules.warnings];
    if (parts.length > 0 && parsed.data.purchasedOn == null) {
      warnings.push(
        `No purchase date: the original parts count from ${start}, the day the bike is added.`,
      );
    }
    const counts = `${parts.length} part(s) and ${result.added.rules.length} maintenance rule(s)`;
    return answer(
      dryRun
        ? `Dry run: would create ${result.bike.name} with ${counts}. Nothing was written.`
        : `Created ${result.bike.name} (bike ${result.bikeId}) with ${counts}. ${result.bike.url}`,
      {
        dry_run: dryRun,
        bike: result.bike,
        rules_created: result.rules.rules,
        shops_created: result.added.shops.map((shop) => shop.name),
        warnings,
      },
    );
  },
});

const updateBikeTool = defineTool({
  name: "update_bike",
  title: "Modifier un vélo",
  kind: "write",
  description:
    "Changes a bike's record: only the fields given change (null clears an optional field). The frame number is never changed here. Units: grams, metres, seconds, euro cents, dates YYYY-MM-DD. Call with dry_run true first.",
  input: z
    .strictObject(bikeFields)
    .partial()
    .extend({ bike_id: z.number().describe("The bike (list_bikes)."), dry_run: dryRunInput }),
  run: (ctx, { bike_id: bikeId, dry_run: dryRun, ...args }) => {
    const bike = getBike(ctx, bikeId);
    if (!bike) return notFound();
    const day = today();
    // The sheet's current values (its extra keys, id and status date, are not part of the input).
    const parsed = bikeInputSchema(day).safeParse(bikeInputOf(bikeForm(bike), args));
    if (!parsed.success) {
      return refused(
        fieldErrorsOf(parsed.error.issues),
        "The change was refused; nothing was written.",
      );
    }
    const write = () => {
      const before = snapshot(ctx, bikeId);
      const outcome = updateBike(ctx, bikeId, toBikeData(parsed.data, bike, day));
      if (!outcome.ok) {
        throw new ToolRefusal([
          outcome.reason === "name_taken"
            ? { field: "name", message: bikeNameTakenMessage(outcome.takenBy) }
            : { field: "bike_id", message: "Vélo introuvable." },
        ]);
      }
      // An existing bike: its id is real even in a dry run.
      return { added: addedSince(ctx, bikeId, before), bike: describeBike(ctx, bikeId)! };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) {
      logWrite(ctx, "update_bike", {
        bike_id: bikeId,
        shop_ids: result.added.shops.map((shop) => shop.id),
      });
    }
    return answer(
      dryRun
        ? `Dry run: ${result.bike.name} would be saved as shown. Nothing was written.`
        : `Saved ${result.bike.name} (bike ${bikeId}). ${result.bike.url}`,
      {
        dry_run: dryRun,
        bike: result.bike,
        shops_created: result.added.shops.map((shop) => shop.name),
        warnings: [],
      },
    );
  },
});

export const bikeTools = [listBikesTool, getBikeTool, createBikeTool, updateBikeTool];
