import "server-only";
import { z } from "zod";
import { RIDE_CONDITIONS, RIDE_TYPES } from "@/lib/enums";
import { isLocalDate, type LocalDate } from "@/lib/format";
import type { QuickRideInput } from "@/lib/view-models";
import type { RideData } from "@/server/db";
import { rideStartInstant } from "@/server/domain/time";

// Validation of the quick ride entry (D-50: clean on the way in; principle 1: only the bike, the
// date and one duration are required).

const MAX_DURATION_S = 48 * 3600;
const duration = (message: string) =>
  z.number({ error: message }).int(message).min(60, message).max(MAX_DURATION_S, message);
const optionalInt = (max: number, message: string) =>
  z.number({ error: message }).int(message).min(0, message).max(max, message).nullable();

export function quickRideSchema(today: LocalDate) {
  return z
    .object({
      bikeId: z.number().int().positive(),
      on: z
        .string()
        .refine(isLocalDate, "Date invalide.")
        .refine((date) => date <= today, "La date ne peut pas être dans le futur."),
      rideType: z.enum(RIDE_TYPES),
      durationS: duration("Durée entre 1 min et 48 h.").nullable(),
      totalTimeS: duration("Durée entre 1 min et 48 h.").nullable(),
      descentTimeS: duration("Durée entre 1 min et 48 h.").nullable(),
      runsCount: optionalInt(999, "Nombre de descentes invalide."),
      distanceM: optionalInt(2_000_000, "Distance invalide."),
      elevationGainM: optionalInt(30_000, "Dénivelé invalide."),
      conditions: z.enum(RIDE_CONDITIONS).nullable(),
      location: z
        .string()
        .trim()
        .max(100, "100 caractères au maximum.")
        .nullable()
        .transform((value) => value || null),
      notes: z
        .string()
        .trim()
        .max(2000, "2000 caractères au maximum.")
        .nullable()
        .transform((value) => value || null),
      startTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide.")
        .nullable(),
    })
    .refine(
      (ride) => (ride.rideType === "bike_park" ? ride.totalTimeS != null : ride.durationS != null),
      { error: "Indique une durée, même approximative.", path: ["durationS"] },
    )
    .refine(
      (ride) =>
        ride.descentTimeS == null ||
        ride.totalTimeS == null ||
        ride.descentTimeS <= ride.totalTimeS,
      {
        error: "Le temps de descente ne peut pas dépasser le temps total.",
        path: ["descentTimeS"],
      },
    ) satisfies z.ZodType<QuickRideInput, unknown>;
}

/**
 * What a quick entry writes (D-64): the single duration is the ride's total time; a bike park day
 * keeps its total and descent times and its runs, and counts as lift-assisted.
 */
export function toRideData(input: QuickRideInput, timeZone: string): RideData {
  const park = input.rideType === "bike_park";
  const time = input.startTime
    ? { hour: Number(input.startTime.slice(0, 2)), minute: Number(input.startTime.slice(3)) }
    : null;
  return {
    bikeId: input.bikeId,
    startedAt: rideStartInstant(input.on, time, timeZone),
    title: null,
    location: input.location,
    rideType: input.rideType,
    liftAssisted: park,
    distanceM: input.distanceM,
    descentDistanceM: null,
    totalTimeS: park ? input.totalTimeS : input.durationS,
    movingTimeS: null,
    descentTimeS: park ? input.descentTimeS : null,
    runsCount: park ? input.runsCount : null,
    elevationGainM: input.elevationGainM,
    elevationLossM: null,
    conditions: input.conditions,
    notes: input.notes,
  };
}
