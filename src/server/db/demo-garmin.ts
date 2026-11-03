import "server-only";
import { addDays, type LocalDate } from "@/lib/format";
import { toImportedActivity, type GarminActivitySummary } from "@/server/domain/garmin";
import type { AccessContext } from "./access-context";
import { importActivity, linkPendingActivity, setActivityTypeBike } from "./garmin";
import { listRides } from "./rides";

// The demo garage's Garmin imports (fictitious, D-22, D-101): no key and no integration, only
// what an import leaves: the bike of two activity types, a ride typed by hand that was the same
// activity ("C'est la même sortie"), and an activity waiting in "À classer". No ride is added,
// so the demo's counters stay those of /design.

const summary = (id: number, startUtc: Date, overrides: Partial<GarminActivitySummary>) => {
  const gmt = startUtc.toISOString().slice(0, 19).replace("T", " ");
  return {
    activityId: id,
    activityName: "Sortie VTT",
    startTimeGMT: gmt,
    startTimeLocal: gmt,
    activityType: { typeId: 5, typeKey: "mountain_biking", parentTypeId: 2 },
    distance: 35_000.4,
    duration: 8400.25,
    movingDuration: 8100,
    elapsedDuration: 9000.5,
    elevationGain: 1120,
    elevationLoss: 1118,
    ...overrides,
  } satisfies GarminActivitySummary;
};

export function seedDemoGarmin(input: {
  ctx: AccessContext;
  bikes: Map<string, { id: number }>;
  day: (date: LocalDate) => LocalDate;
}): void {
  const { ctx, bikes, day } = input;
  const spectral = bikes.get("Spectral");
  const gravel = bikes.get("Gravel alu");
  if (!spectral || !gravel) return;
  setActivityTypeBike(ctx, "garmin", "mountain_biking", spectral.id);
  setActivityTypeBike(ctx, "garmin", "gravel_cycling", gravel.id);

  // The Salève ride, typed by hand, then read from Garmin: linked, nothing added.
  const saleve = listRides(ctx, { bikeId: spectral.id }).find((ride) => ride.location === "Salève");
  if (saleve) {
    const same = toImportedActivity(
      summary(1_000_000_001, new Date(saleve.startedAt + 4 * 60_000), { locationName: "Salève" }),
    );
    if (same) {
      const outcome = importActivity(ctx, "garmin", same, {
        kind: "pending",
        reason: "possible_duplicate",
        suggestedBikeId: spectral.id,
      });
      if (outcome.ok) linkPendingActivity(ctx, outcome.externalActivityId, saleve.id);
    }
  }

  // A cyclocross session: no bike for that type, it waits.
  const cross = toImportedActivity(
    summary(1_000_000_002, new Date(`${day(addDays("2026-10-25", -2))}T17:30:00Z`), {
      activityName: "Cyclocross",
      activityType: { typeId: 19, typeKey: "cyclocross", parentTypeId: 2 },
      distance: 18_400.2,
      duration: 3600.5,
      movingDuration: 3500,
      elevationGain: 210,
      elevationLoss: 210,
    }),
  );
  if (cross) {
    importActivity(ctx, "garmin", cross, {
      kind: "pending",
      reason: "no_bike_for_type",
      suggestedBikeId: null,
    });
  }
}
