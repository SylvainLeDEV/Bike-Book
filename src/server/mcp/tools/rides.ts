import "server-only";
import { z } from "zod";
import { RIDE_CONDITIONS, RIDE_TYPES } from "@/lib/enums";
import { isLocalDate, localDateOf, localTimeOf, startOfLocalDay } from "@/lib/format";
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

function parseRide(input: QuickRideInput) {
  const parsed = quickRideSchema(today()).safeParse(input);
  if (!parsed.success) {
    throw new ToolRefusal(
      fieldErrorsOf(parsed.error.issues),
      "The ride was refused; nothing was written.",
    );
  }
  return toRideData(parsed.data, getEnv().timeZone);
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
    const empty: QuickRideInput = {
      bikeId,
      on: args.on,
      rideType: args.ride_type,
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
    const data = parseRide(formInput(empty, args));
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

export const rideTools = [listRidesTool, createRideTool, updateRideTool, deleteRideTool];
