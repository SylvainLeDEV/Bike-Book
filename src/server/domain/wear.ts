import "server-only";

/** What the wear engine needs from a ride (docs/03, wear counters). */
export type RideUsage = {
  id: number;
  startedAt: number;
  liftAssisted: boolean;
  distanceM: number | null;
  descentDistanceM: number | null;
  totalTimeS: number | null;
  movingTimeS: number | null;
  descentTimeS: number | null;
};

export type Wear = { distanceM: number; wearS: number };

/**
 * The wear of one ride (D-13): on lift-assisted rides, descent time if entered, else moving time,
 * else total time; same logic for the distance. Falling back to the larger value is conservative:
 * the reminder comes early, never late.
 */
export function rideWear(ride: RideUsage): Wear {
  const wearS =
    ride.liftAssisted && ride.descentTimeS != null
      ? ride.descentTimeS
      : (ride.movingTimeS ?? ride.totalTimeS ?? 0);
  const distanceM =
    ride.liftAssisted && ride.descentDistanceM != null
      ? ride.descentDistanceM
      : (ride.distanceM ?? 0);
  return { distanceM, wearS };
}

export type Usage = Wear & { rideIds: number[] };

/** The wear of the rides that started in [from, to): `from` null = since ever, `to` null = until now. */
export function usageBetween(rides: RideUsage[], from: number | null, to: number | null): Usage {
  const usage: Usage = { distanceM: 0, wearS: 0, rideIds: [] };
  for (const ride of rides) {
    if (from != null && ride.startedAt < from) continue;
    if (to != null && ride.startedAt >= to) continue;
    const wear = rideWear(ride);
    usage.distanceM += wear.distanceM;
    usage.wearS += wear.wearS;
    usage.rideIds.push(ride.id);
  }
  return usage;
}

/**
 * A component's counter: its usage before it was fitted plus the bike's rides with
 * `installed_at ≤ started_at < removed_at` (instants, so a part fitted at 18:00 does not count
 * that morning's ride). `at` stops the count earlier (wear at removal, at a date).
 */
export function componentCounter(
  component: {
    installedAt: number;
    removedAt: number | null;
    initialDistanceM: number;
    initialWearS: number;
  },
  rides: RideUsage[],
): Usage {
  const usage = usageBetween(rides, component.installedAt, component.removedAt);
  return {
    distanceM: component.initialDistanceM + usage.distanceM,
    wearS: component.initialWearS + usage.wearS,
    rideIds: usage.rideIds,
  };
}
