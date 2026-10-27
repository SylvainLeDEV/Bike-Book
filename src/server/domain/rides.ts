import "server-only";
import type { Discipline, RideType } from "@/lib/enums";
import { cleanName, nameKey } from "@/lib/names";
import { defaultRideType } from "./bikes";
import { rideWear, type RideUsage } from "./wear";

type PastRide = { bikeId: number; rideType: RideType; location: string | null; startedAt: number };

export type QuickRideDefaults = {
  defaultBikeId: number | null;
  usualRideType: Map<number, RideType>;
  recentLocations: string[];
};

/**
 * The quick entry's defaults (principle 1, under 30 seconds): the bike of the last ride, each
 * bike's most frequent ride type (ties: the most recent), places of previous rides (most used
 * first, the latest spelling kept). Bikes without rides get their discipline's type.
 */
export function quickRideDefaults(
  pastRides: PastRide[],
  bikes: { id: number; discipline: Discipline }[],
  maxLocations = 6,
): QuickRideDefaults {
  const newestFirst = [...pastRides].sort((a, b) => b.startedAt - a.startedAt);
  const ids = new Set(bikes.map((bike) => bike.id));
  const lastBike = newestFirst.find((ride) => ids.has(ride.bikeId))?.bikeId;

  const usualRideType = new Map<number, RideType>();
  for (const bike of bikes) {
    const counts = new Map<RideType, number>();
    for (const ride of newestFirst) {
      if (ride.bikeId === bike.id) counts.set(ride.rideType, (counts.get(ride.rideType) ?? 0) + 1);
    }
    // Map keeps insertion order (newest first), so the first maximum is the most recent one.
    let best: RideType | null = null;
    for (const [type, count] of counts) if (best == null || count > counts.get(best)!) best = type;
    usualRideType.set(bike.id, best ?? defaultRideType(bike.discipline));
  }

  const places = new Map<string, { name: string; count: number }>();
  for (const ride of newestFirst) {
    if (!ride.location?.trim()) continue;
    const key = nameKey(ride.location);
    const place = places.get(key);
    if (place) place.count += 1;
    else places.set(key, { name: cleanName(ride.location), count: 1 });
  }
  const recentLocations = [...places.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxLocations)
    .map((place) => place.name);

  return { defaultBikeId: lastBike ?? bikes[0]?.id ?? null, usualRideType, recentLocations };
}

/** The duration a ride is shown with: moving time, else total time. */
export function rideDurationS(ride: Pick<RideUsage, "movingTimeS" | "totalTimeS">): number | null {
  return ride.movingTimeS ?? ride.totalTimeS;
}

/** Distance and shown duration of the rides started from `from` on (this month's riding). */
export function ridingSince(
  rides: RideUsage[],
  from: number,
): { distanceM: number; durationS: number } {
  let distanceM = 0;
  let durationS = 0;
  for (const ride of rides) {
    if (ride.startedAt < from) continue;
    distanceM += ride.distanceM ?? 0;
    durationS += rideDurationS(ride) ?? 0;
  }
  return { distanceM, durationS };
}

/** The wear counted on a lift-assisted ride, when it differs from the duration shown (D-13). */
export function shownWearS(ride: RideUsage): number | null {
  if (!ride.liftAssisted) return null;
  const wear = rideWear(ride).wearS;
  return wear !== rideDurationS(ride) ? wear : null;
}
