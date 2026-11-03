import "server-only";
import { z } from "zod";
import { RIDE_CONDITIONS, RIDE_TYPES } from "@/lib/enums";
import { formatDate, isLocalDate, localDateOf, localTimeOf, startOfLocalDay } from "@/lib/format";
import { RIDE_TYPE_LABELS } from "@/lib/labels";
import type { QuickRideInput } from "@/lib/view-models";
import { quickRideSchema, toRideData } from "@/server/actions/ride-input";
import {
  atomically,
  createRide,
  deleteRide,
  getBike,
  listAttachments,
  listBikes,
  listComponents,
  listRides,
  listRules,
  previewWrite,
  updateRide,
  type AccessContext,
  type Ride,
} from "@/server/db";
import { rideDurationS, ridesNear } from "@/server/domain/rides";
import { rideWear } from "@/server/domain/wear";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { rideForm } from "@/server/views/timeline";
import { bikeUrl, evaluateRules, type Ids } from "../describe";
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

// Rides (feature 4) through the MCP (D-92): the quick entry's own schema and defaults (D-64),
// "Modifier la sortie" and "Supprimer la sortie" (D-70). Wear is derived from the rides (D-13),
// so a write answers with the rules it makes due. A delete only takes rides typed by hand, as in
// the app; a spreadsheet import (create_rides, Q-14 to Q-16) is still to come.

/** A ride as the tools answer it: the stored values, its day and time, and its wear (D-13). */
function describeRide(ride: Ride, bikeNames: Map<number, string>, ids: Ids = "real") {
  const { timeZone } = getEnv();
  const time = localTimeOf(ride.startedAt, timeZone);
  const wear = rideWear(ride);
  return {
    id: ids === "real" ? ride.id : null,
    bike: { id: ride.bikeId, name: bikeNames.get(ride.bikeId) ?? "" },
    on: localDateOf(ride.startedAt, timeZone),
    /** Local time, HH:MM; null: none was given (stored at noon). */
    start_time: time === "12:00" ? null : time,
    started_at: new Date(ride.startedAt).toISOString(),
    ride_type: ride.rideType,
    ride_type_label: RIDE_TYPE_LABELS[ride.rideType],
    title: ride.title,
    location: ride.location,
    lift_assisted: ride.liftAssisted,
    distance_m: ride.distanceM,
    total_time_s: ride.totalTimeS,
    moving_time_s: ride.movingTimeS,
    descent_time_s: ride.descentTimeS,
    runs_count: ride.runsCount,
    elevation_gain_m: ride.elevationGainM,
    conditions: ride.conditions,
    notes: ride.notes,
    /** manual (typed in the app or through these tools), garmin_api, file_import. */
    source: ride.source,
    /** What the parts' counters take from it (D-13): descent on a lift-assisted ride. */
    wear_distance_m: wear.distanceM,
    wear_time_s: wear.wearS,
  };
}

const bikeNamesOf = (ctx: AccessContext) =>
  new Map(listBikes(ctx).map((bike) => [bike.id, bike.name]));

/** The rules of these bikes whose status a write moves to due soon or overdue. */
function rulesMadeDue(
  ctx: AccessContext,
  bikeIds: number[],
  before: Map<number, Map<number, string>>,
) {
  return bikeIds.flatMap((bikeId) => {
    const titles = new Map(listRules(ctx, bikeId).map((rule) => [rule.id, rule.title]));
    return [...evaluateRules(ctx, bikeId)].flatMap(([ruleId, evaluation]) => {
      const was = before.get(bikeId)?.get(ruleId) ?? null;
      const now = evaluation.status;
      return (now === "due_soon" || now === "overdue") && was !== now
        ? [{ rule_id: ruleId, bike_id: bikeId, title: titles.get(ruleId) ?? "", status: now, was }]
        : [];
    });
  });
}

function statusesOf(ctx: AccessContext, bikeIds: number[]) {
  return new Map(
    bikeIds.map((bikeId) => [
      bikeId,
      new Map([...evaluateRules(ctx, bikeId)].map(([id, e]) => [id, e.status as string])),
    ]),
  );
}

// --- Fields shared by create_ride and update_ride ------------------------------------------------

const PARK_ONLY = ["total_time_s", "descent_time_s", "runs_count"] as const;

const rideFields = {
  on: z.string().describe("Day of the ride, YYYY-MM-DD, not in the future."),
  ride_type: z
    .enum(RIDE_TYPES)
    .describe(
      "road, gravel, xc, trail, enduro, dh, bike_park (a lift-assisted day), commute, indoor, other.",
    ),
  duration_s: z
    .number()
    .nullable()
    .optional()
    .describe(
      "Every type but bike_park: the ride's duration, seconds (60 to 172800; 1 h 30 → 5400).",
    ),
  total_time_s: z
    .number()
    .nullable()
    .optional()
    .describe("bike_park only, required: the whole day on the bike, seconds."),
  descent_time_s: z
    .number()
    .nullable()
    .optional()
    .describe("bike_park only: time spent going down, seconds; what wears the parts (D-13)."),
  runs_count: z.number().nullable().optional().describe("bike_park only: number of runs."),
  distance_m: z.number().nullable().optional().describe("Metres (42 km → 42000)."),
  elevation_gain_m: z.number().nullable().optional().describe("Metres climbed."),
  conditions: z
    .enum(RIDE_CONDITIONS)
    .nullable()
    .optional()
    .describe("dry, wet, mud, dust, snow, mixed."),
  location: z
    .string()
    .nullable()
    .optional()
    .describe('Where: "Les Gets", "Forêt de Fontainebleau".'),
  notes: z.string().nullable().optional(),
  start_time: z
    .string()
    .nullable()
    .optional()
    .describe("Local start time, HH:MM (24 h); omitted or null: none (stored at noon)."),
};

type RideArgs = Partial<{
  [K in keyof typeof rideFields]: z.output<(typeof rideFields)[K]>;
}>;

/** Park fields on another type, or a duration on a park day: refused, never ignored. */
function misplacedFields(rideType: string, args: RideArgs): FieldError[] {
  const park = rideType === "bike_park";
  const wrong = park
    ? args.duration_s != null
      ? ["duration_s"]
      : []
    : PARK_ONLY.filter((field) => args[field] != null);
  return wrong.map((field) => ({
    field,
    message: park
      ? "En bike park, indique le temps total (total_time_s)."
      : "Seulement pour une journée en bike park.",
  }));
}

/** The form's input, the fields given replacing those of `base`. */
function formInput(base: QuickRideInput, args: RideArgs & { bike_id?: number }): QuickRideInput {
  const pick = <T>(value: T | undefined, current: T) => (value === undefined ? current : value);
  const rideType = args.ride_type ?? base.rideType;
  const park = rideType === "bike_park";
  // A type change keeps the duration typed before: the sheet's single field.
  const typed = base.durationS ?? base.totalTimeS;
  return {
    bikeId: args.bike_id ?? base.bikeId,
    on: args.on ?? base.on,
    rideType,
    durationS: park ? null : pick(args.duration_s, base.durationS ?? typed),
    totalTimeS: park ? pick(args.total_time_s, base.totalTimeS ?? typed) : null,
    descentTimeS: park ? pick(args.descent_time_s, base.descentTimeS) : null,
    runsCount: park ? pick(args.runs_count, base.runsCount) : null,
    distanceM: pick(args.distance_m, base.distanceM),
    elevationGainM: pick(args.elevation_gain_m, base.elevationGainM),
    conditions: pick(args.conditions, base.conditions),
    location: pick(args.location, base.location),
    notes: pick(args.notes, base.notes),
    startTime: pick(args.start_time, base.startTime),
  };
}

function parseRide(input: QuickRideInput, prefix = "") {
  const parsed = quickRideSchema(today()).safeParse(input);
  if (!parsed.success) {
    throw new ToolRefusal(
      fieldErrorsOf(parsed.error.issues, prefix),
      "The ride was refused; nothing was written.",
    );
  }
  return toRideData(parsed.data, getEnv().timeZone);
}

/** A new ride's form input: the quick entry's empty sheet, with the fields given. */
function newRideInput(bikeId: number, args: RideArgs) {
  const empty: QuickRideInput = {
    bikeId,
    on: args.on ?? "",
    rideType: args.ride_type ?? "other",
    durationS: null,
    totalTimeS: null,
    descentTimeS: null,
    runsCount: null,
    distanceM: null,
    elevationGainM: null,
    conditions: null,
    location: null,
    notes: null,
    startTime: null,
  };
  return formInput(empty, args);
}

function duplicateWarnings(
  ctx: AccessContext,
  bikeId: number,
  startedAt: number,
  exceptId?: number,
) {
  const near = ridesNear(listRides(ctx, { bikeId }), { bikeId, startedAt, exceptId });
  return near.length
    ? [
        `This bike already has ${near.length} ride(s) starting within 30 minutes (ride ${near.map((r) => r.id).join(", ")}): check with the owner that it is not the same ride.`,
      ]
    : [];
}

function dueWarnings(madeDue: ReturnType<typeof rulesMadeDue>, dryRun: boolean): string[] {
  return madeDue.length
    ? [
        `${madeDue.length} maintenance rule(s) ${dryRun ? "would become" : "became"} due soon or overdue (rules_made_due): tell the owner.`,
      ]
    : [];
}

// --- list_rides ----------------------------------------------------------------------------------

const listRidesTool = defineTool({
  name: "list_rides",
  title: "Sorties",
  kind: "read",
  description:
    "The rides, newest first: day and local start time, type, distance (metres), durations (seconds), descent time and runs on bike park days, elevation, conditions, place, notes, source, and the wear it counts (D-13: on lift-assisted rides, the descent). Filters: bike_id, from and to (days YYYY-MM-DD, both included), ride_type. totals sums the whole filtered list, not just the page: rides, distance, shown duration (moving time, else total) and wear time.",
  input: z.strictObject({
    bike_id: z.number().optional().describe("Only this bike's rides (list_bikes)."),
    from: z.string().optional().describe("First day, YYYY-MM-DD."),
    to: z.string().optional().describe("Last day, YYYY-MM-DD."),
    ride_type: z.enum(RIDE_TYPES).optional(),
    ...pageInput,
  }),
  run: (ctx, { bike_id: bikeId, from, to, ride_type: rideType, ...page }) => {
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
    const { timeZone } = getEnv();
    const fromAt = from ? startOfLocalDay(from, timeZone) : null;
    const rides = listRides(ctx, bikeId == null ? {} : { bikeId }).filter(
      (ride) =>
        (rideType == null || ride.rideType === rideType) &&
        (fromAt == null || ride.startedAt >= fromAt) &&
        (to == null || localDateOf(ride.startedAt, timeZone) <= to),
    );
    const names = bikeNamesOf(ctx);
    const { items, next_cursor } = paginate(rides, (ride) => String(ride.id), page);
    const totals = rides.reduce(
      (sum, ride) => ({
        rides: sum.rides + 1,
        distance_m: sum.distance_m + (ride.distanceM ?? 0),
        duration_s: sum.duration_s + (rideDurationS(ride) ?? 0),
        wear_time_s: sum.wear_time_s + rideWear(ride).wearS,
      }),
      { rides: 0, distance_m: 0, duration_s: 0, wear_time_s: 0 },
    );
    return answer(`${items.length} of ${rides.length} rides.`, {
      rides: items.map((ride) => describeRide(ride, names)),
      next_cursor,
      totals,
    });
  },
});

// --- create_ride ---------------------------------------------------------------------------------

const createRideTool = defineTool({
  name: "create_ride",
  title: "Ajouter une sortie",
  kind: "write",
  description:
    "Adds a ride, as the app's quick entry: the bike, the day, the type and one duration are enough (bike_park: total_time_s, and descent_time_s, which is what wears the parts). Distances in metres, durations in seconds. The answer gives the maintenance rules the ride makes due soon or overdue, and warns when the bike already has a ride starting within 30 minutes. Call with dry_run true first.",
  input: z.strictObject({
    bike_id: z.number().describe("The bike (list_bikes)."),
    ...rideFields,
    dry_run: dryRunInput,
  }),
  run: (ctx, { bike_id: bikeId, dry_run: dryRun, ...args }) => {
    const bike = getBike(ctx, bikeId);
    if (!bike)
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    const misplaced = misplacedFields(args.ride_type, args);
    if (misplaced.length) return refused(misplaced, "The ride was refused; nothing was written.");
    const data = parseRide(newRideInput(bikeId, args));
    const warnings = duplicateWarnings(ctx, bikeId, data.startedAt);
    const before = statusesOf(ctx, [bikeId]);
    const ids: Ids = dryRun ? "none" : "real";

    const write = () => {
      const outcome = createRide(ctx, data);
      if (!outcome.ok) throw new ToolRefusal([{ field: "bike_id", message: "Vélo introuvable." }]);
      const ride = listRides(ctx, { bikeId }).find((r) => r.id === outcome.rideId)!;
      return {
        rideId: outcome.rideId,
        ride: describeRide(ride, bikeNamesOf(ctx), ids),
        madeDue: rulesMadeDue(ctx, [bikeId], before),
      };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "create_ride", { ride_id: result.rideId });
    return answer(
      dryRun
        ? `Dry run: would add a ${result.ride.ride_type} ride on ${result.ride.on} to ${bike.name}. Nothing was written.`
        : `Added ride ${result.rideId} on ${result.ride.on} to ${bike.name}.`,
      {
        dry_run: dryRun,
        ride: result.ride,
        rules_made_due: result.madeDue,
        warnings: [...warnings, ...dueWarnings(result.madeDue, dryRun)],
        bike_url: bikeUrl(bikeId),
      },
    );
  },
});

// --- update_ride ---------------------------------------------------------------------------------

const updateRideTool = defineTool({
  name: "update_ride",
  title: "Modifier une sortie",
  kind: "write",
  description:
    'Changes a ride, as "Modifier la sortie": only the fields given change, bike_id moves it to another bike. Changing the duration drops a moving time recorded before (the app keeps one duration). Switching to or from bike_park keeps the duration typed. The answer gives the rules the change makes due. Call with dry_run true first.',
  input: z.strictObject({
    ride_id: z.number().describe("The ride (list_rides)."),
    bike_id: z.number().optional().describe("Another bike of the workspace (list_bikes)."),
    ...(Object.fromEntries(
      Object.entries(rideFields).map(([key, schema]) => [key, schema.optional()]),
    ) as { [K in keyof typeof rideFields]: z.ZodOptional<(typeof rideFields)[K]> }),
    dry_run: dryRunInput,
  }),
  run: (ctx, { ride_id: rideId, dry_run: dryRun, ...args }) => {
    const current = listRides(ctx).find((ride) => ride.id === rideId);
    if (!current) {
      return refused([{ field: "ride_id", message: "Sortie introuvable." }], "Unknown ride.");
    }
    if (args.bike_id != null && !getBike(ctx, args.bike_id)) {
      return refused([{ field: "bike_id", message: "Vélo introuvable." }], "Unknown bike.");
    }
    const base = rideForm(current, getEnv().timeZone);
    const rideType = args.ride_type ?? base.rideType;
    const misplaced = misplacedFields(rideType, args as RideArgs);
    if (misplaced.length) return refused(misplaced, "The ride was refused; nothing was written.");
    const data = parseRide(formInput(base, args as RideArgs & { bike_id?: number }));
    const bikeIds = [...new Set([current.bikeId, data.bikeId])];
    const warnings = duplicateWarnings(ctx, data.bikeId, data.startedAt, rideId);
    const before = statusesOf(ctx, bikeIds);
    const write = () => {
      if (!updateRide(ctx, rideId, data).ok) {
        throw new ToolRefusal([{ field: "ride_id", message: "Sortie introuvable." }]);
      }
      const ride = listRides(ctx).find((r) => r.id === rideId)!;
      return {
        ride: describeRide(ride, bikeNamesOf(ctx)),
        madeDue: rulesMadeDue(ctx, bikeIds, before),
      };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "update_ride", { ride_id: rideId });
    return answer(
      dryRun
        ? `Dry run: would change ride ${rideId}. Nothing was written.`
        : `Changed ride ${rideId}.`,
      {
        dry_run: dryRun,
        ride: result.ride,
        before: describeRide(current, bikeNamesOf(ctx)),
        rules_made_due: result.madeDue,
        warnings: [...warnings, ...dueWarnings(result.madeDue, dryRun)],
        bike_url: bikeUrl(data.bikeId),
      },
    );
  },
});

// --- delete_ride ---------------------------------------------------------------------------------

const deleteRideTool = defineTool({
  name: "delete_ride",
  title: "Supprimer une sortie",
  kind: "delete",
  description:
    'Deletes a ride typed by hand, as "Supprimer la sortie": for good, with its attachments (photos, files); the parts\' counters lose its wear. An imported ride (source garmin_api or file_import) cannot be deleted. The dry run says what would go and writes nothing; delete only once the owner has confirmed this ride (day, bike, duration).',
  input: z.strictObject({
    ride_id: z.number().describe("The ride (list_rides)."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { ride_id: rideId, dry_run: dryRun }) => {
    const ride = listRides(ctx).find((r) => r.id === rideId);
    if (!ride)
      return refused([{ field: "ride_id", message: "Sortie introuvable." }], "Unknown ride.");
    if (ride.source !== "manual") {
      return refused(
        [{ field: "ride_id", message: "Une sortie importée ne peut pas être supprimée." }],
        "The ride was refused; nothing was deleted.",
      );
    }
    const described = describeRide(ride, bikeNamesOf(ctx));
    const attachmentCount = listAttachments(ctx, { kind: "ride", id: rideId })?.length ?? 0;
    const warnings = attachmentCount
      ? [`Its ${attachmentCount} attachment(s) would be deleted with it, files included.`]
      : [];
    // Never through previewWrite: deleting a ride removes its files once the delete is done
    // (D-76), so a dry run only describes it.
    if (dryRun) {
      return answer(
        `Dry run: would delete ride ${rideId} (${described.on}, ${described.bike.name}). Nothing was deleted.`,
        { dry_run: true, ride: described, attachment_count: attachmentCount, warnings },
      );
    }
    if (!deleteRide(ctx, rideId).ok) {
      return refused(
        [{ field: "ride_id", message: "Cette sortie ne peut pas être supprimée." }],
        "Nothing was deleted.",
      );
    }
    logWrite(ctx, "delete_ride", { ride_id: rideId });
    return answer(`Deleted ride ${rideId} (${described.on}, ${described.bike.name}).`, {
      dry_run: false,
      deleted: described,
      attachment_count: attachmentCount,
      warnings: [],
      bike_url: bikeUrl(ride.bikeId),
    });
  },
});

// --- create_rides and delete_rides: an import in batches (D-97) ----------------------------------

const MAX_BATCH = 500;

const createRidesTool = defineTool({
  name: "create_rides",
  title: "Importer des sorties",
  kind: "write",
  description: `Adds up to ${MAX_BATCH} rides at once (a spreadsheet or a log read by the assistant), each as create_ride's fields with its bike_id, in one transaction: one ride refused refuses them all, its errors named rides[3].duration_s. They are rides like the ones typed (source manual). A ride before the bike's purchase day is refused. The dry run warns about rides within 30 minutes of another of the same bike (in the app or in the batch; skip_duplicates true leaves out those matching a ride already in the app) and about bikes or parts with counters from before tracking: they may already hold this history's wear, so ask the owner whether to lower them (update_bike, update_component) before writing. The answer gives the ids created (undo: delete_rides), each bike's totals before and after, and the rules made due. Call with dry_run true first.`,
  input: z.strictObject({
    rides: z
      .array(
        z.strictObject({
          bike_id: z.number().describe("The bike (list_bikes)."),
          ...rideFields,
        }),
      )
      .min(1)
      .max(MAX_BATCH),
    skip_duplicates: z
      .boolean()
      .optional()
      .describe("true: leave out the rides within 30 minutes of a ride already in the app."),
    dry_run: dryRunInput,
  }),
  run: (ctx, { rides: given, skip_duplicates: skipDuplicates = false, dry_run: dryRun }) => {
    const REFUSED = "The import was refused; nothing was written.";
    const bikes = new Map(listBikes(ctx).map((bike) => [bike.id, bike]));
    const errors: FieldError[] = [];
    const prepared: { index: number; data: ReturnType<typeof parseRide> }[] = [];
    given.forEach((ride, index) => {
      const prefix = `rides[${index}]`;
      const bike = bikes.get(ride.bike_id);
      if (!bike) {
        errors.push({ field: `${prefix}.bike_id`, message: "Vélo introuvable." });
        return;
      }
      const misplaced = misplacedFields(ride.ride_type, ride);
      if (misplaced.length) {
        errors.push(...misplaced.map((e) => ({ ...e, field: `${prefix}.${e.field}` })));
        return;
      }
      if (bike.purchasedOn && ride.on < bike.purchasedOn) {
        errors.push({
          field: `${prefix}.on`,
          message: `Avant l'achat du vélo (${formatDate(bike.purchasedOn)}).`,
        });
        return;
      }
      try {
        prepared.push({ index, data: parseRide(newRideInput(ride.bike_id, ride), prefix) });
      } catch (error) {
        if (error instanceof ToolRefusal) errors.push(...error.errors);
        else throw error;
      }
    });
    if (errors.length) return refused(errors.slice(0, 50), REFUSED);

    // Duplicates: against the app's rides (skipped on request), then inside the batch.
    const bikeIds = [...new Set(prepared.map((p) => p.data.bikeId))];
    const existing = new Map(bikeIds.map((id) => [id, listRides(ctx, { bikeId: id })]));
    const skipped: number[] = [];
    const duplicates: number[] = [];
    const kept = prepared.filter(({ index, data }) => {
      const near = ridesNear(existing.get(data.bikeId) ?? [], {
        bikeId: data.bikeId,
        startedAt: data.startedAt,
      });
      if (near.length && skipDuplicates) {
        skipped.push(index);
        return false;
      }
      if (near.length) duplicates.push(index);
      return true;
    });
    const inBatch = kept.filter(({ index, data }) =>
      kept.some(
        (other) =>
          other.index < index &&
          ridesNear(
            [{ id: other.index, bikeId: other.data.bikeId, startedAt: other.data.startedAt }],
            {
              bikeId: data.bikeId,
              startedAt: data.startedAt,
            },
          ).length,
      ),
    );

    const warnings: string[] = [];
    if (duplicates.length) {
      warnings.push(
        `${duplicates.length} ride(s) start within 30 minutes of a ride already in the app (rides[${duplicates.slice(0, 10).join("], rides[")}]${duplicates.length > 10 ? ", …" : ""}): the same rides? skip_duplicates true leaves them out.`,
      );
    }
    if (inBatch.length) {
      warnings.push(
        `${inBatch.length} ride(s) start within 30 minutes of another ride of the batch on the same bike (rides[${inBatch
          .slice(0, 10)
          .map((r) => r.index)
          .join("], rides[")}]): check the spreadsheet.`,
      );
    }
    const withCounters = bikeIds.flatMap((id) => {
      const bike = bikes.get(id)!;
      const parts = listComponents(ctx, id).filter(
        (part) => part.removedAt == null && (part.initialDistanceM > 0 || part.initialWearS > 0),
      );
      return bike.initialDistanceM > 0 || bike.initialWearS > 0 || parts.length
        ? [
            `${bike.name} (${bike.initialDistanceM > 0 ? `${Math.round(bike.initialDistanceM / 1000)} km before tracking` : "counters"}${parts.length ? `, ${parts.length} part(s) with initial counters` : ""})`,
          ]
        : [];
    });
    if (withCounters.length) {
      warnings.push(
        `Initial counters on ${withCounters.join("; ")}: if they already hold this history's wear, it would count twice. Ask the owner whether to lower them (update_bike, update_component) before writing.`,
      );
    }

    const totalsOf = () =>
      bikeIds.map((id) => {
        const rides = listRides(ctx, { bikeId: id });
        const bike = bikes.get(id)!;
        return {
          bike_id: id,
          name: bike.name,
          ride_count: rides.length,
          distance_m: bike.initialDistanceM + rides.reduce((sum, r) => sum + (r.distanceM ?? 0), 0),
          wear_time_s: bike.initialWearS + rides.reduce((sum, r) => sum + rideWear(r).wearS, 0),
        };
      });
    const before = totalsOf();
    const statuses = statusesOf(ctx, bikeIds);
    const write = () => {
      const ids = kept.map(({ data }) => {
        const outcome = createRide(ctx, data);
        if (!outcome.ok) throw new ToolRefusal([{ field: "rides", message: "Vélo introuvable." }]);
        return outcome.rideId;
      });
      return { ids, after: totalsOf(), madeDue: rulesMadeDue(ctx, bikeIds, statuses) };
    };
    const result = dryRun ? previewWrite(write) : atomically(write);
    if (!dryRun) logWrite(ctx, "create_rides", { ride_ids: result.ids });
    return answer(
      dryRun
        ? `Dry run: would add ${kept.length} ride(s)${skipped.length ? `, ${skipped.length} skipped as duplicates` : ""}. Nothing was written.`
        : `Added ${result.ids.length} ride(s)${skipped.length ? `, ${skipped.length} skipped as duplicates` : ""}.`,
      {
        dry_run: dryRun,
        created_count: kept.length,
        ride_ids: dryRun ? null : result.ids,
        skipped: skipped.map((index) => ({ index, reason: "duplicate" })),
        bikes: before.map((b) => ({
          bike_id: b.bike_id,
          name: b.name,
          before: {
            ride_count: b.ride_count,
            distance_m: b.distance_m,
            wear_time_s: b.wear_time_s,
          },
          after: result.after.find((a) => a.bike_id === b.bike_id),
        })),
        rules_made_due: result.madeDue,
        warnings: [...warnings, ...dueWarnings(result.madeDue, dryRun)],
      },
    );
  },
});

const deleteRidesTool = defineTool({
  name: "delete_rides",
  title: "Supprimer des sorties",
  kind: "delete",
  description: `Deletes up to ${MAX_BATCH} rides typed by hand or imported (create_rides gives their ids): the undo of an import gone wrong. For good, with their attachments; the parts' counters lose their wear. Every id must be a ride of the workspace that can be deleted, or nothing is. The dry run says what would go; delete only once the owner has confirmed.`,
  input: z.strictObject({
    ride_ids: z.array(z.number()).min(1).max(MAX_BATCH),
    dry_run: dryRunInput,
  }),
  run: (ctx, { ride_ids: rideIds, dry_run: dryRun }) => {
    const rides = new Map(listRides(ctx).map((ride) => [ride.id, ride]));
    const errors: FieldError[] = rideIds.flatMap((id, index) => {
      const ride = rides.get(id);
      if (!ride) return [{ field: `ride_ids[${index}]`, message: "Sortie introuvable." }];
      if (ride.source !== "manual") {
        return [
          {
            field: `ride_ids[${index}]`,
            message: "Une sortie importée de Garmin ne peut pas être supprimée.",
          },
        ];
      }
      return [];
    });
    if (errors.length) return refused(errors.slice(0, 50), "Nothing was deleted.");
    const unique = [...new Set(rideIds)];
    const chosen = unique.map((id) => rides.get(id)!);
    const names = bikeNamesOf(ctx);
    const summary = {
      ride_count: chosen.length,
      distance_m: chosen.reduce((sum, r) => sum + (r.distanceM ?? 0), 0),
      first_on: chosen.map((r) => localDateOf(r.startedAt, getEnv().timeZone)).sort()[0],
      last_on: chosen
        .map((r) => localDateOf(r.startedAt, getEnv().timeZone))
        .sort()
        .at(-1),
      bikes: [...new Set(chosen.map((r) => r.bikeId))].map((id) => ({
        id,
        name: names.get(id) ?? "",
      })),
      attachment_count: chosen.reduce(
        (sum, r) => sum + (listAttachments(ctx, { kind: "ride", id: r.id })?.length ?? 0),
        0,
      ),
    };
    // Never through previewWrite: deleting a ride removes its files after the delete (D-76).
    if (dryRun) {
      return answer(`Dry run: would delete ${chosen.length} ride(s). Nothing was deleted.`, {
        dry_run: true,
        ...summary,
        warnings: [],
      });
    }
    for (const ride of chosen) {
      if (!deleteRide(ctx, ride.id).ok) {
        throw new Error(`deleteRide refused ride ${ride.id}, checked above`);
      }
    }
    logWrite(ctx, "delete_rides", { ride_ids: unique });
    return answer(`Deleted ${chosen.length} ride(s).`, {
      dry_run: false,
      ...summary,
      warnings: [],
    });
  },
});

export const rideTools = [
  listRidesTool,
  createRideTool,
  updateRideTool,
  deleteRideTool,
  createRidesTool,
  deleteRidesTool,
];
