import { describe, expect, it } from "vitest";
import { quickRideDefaults, ridingSince, shownWearS } from "./rides";
import type { RideUsage } from "./wear";

const day = (n: number) => Date.UTC(2026, 9, n, 10);

describe("quickRideDefaults", () => {
  const bikes = [
    { id: 1, discipline: "enduro" as const },
    { id: 2, discipline: "gravel" as const },
    { id: 3, discipline: "city" as const },
  ];
  const past = [
    { bikeId: 1, rideType: "trail" as const, location: "Salève", startedAt: day(3) },
    { bikeId: 1, rideType: "enduro" as const, location: "Les Gets", startedAt: day(5) },
    { bikeId: 1, rideType: "trail" as const, location: " salève ", startedAt: day(10) },
    { bikeId: 2, rideType: "gravel" as const, location: null, startedAt: day(20) },
    { bikeId: 1, rideType: "enduro" as const, location: "Massif des  Bauges", startedAt: day(24) },
  ];

  it("offers the bike of the last ride, each bike's usual type and the places most used", () => {
    const defaults = quickRideDefaults(past, bikes);
    expect(defaults.defaultBikeId).toBe(1);
    // Two trails and two enduros: the most recent wins.
    expect(defaults.usualRideType.get(1)).toBe("enduro");
    expect(defaults.usualRideType.get(2)).toBe("gravel");
    expect(defaults.usualRideType.get(3)).toBe("commute");
    expect(defaults.recentLocations).toEqual(["salève", "Massif des Bauges", "Les Gets"]);
  });

  it("falls back to the first bike when no ride is known", () => {
    expect(quickRideDefaults([], bikes).defaultBikeId).toBe(1);
    expect(quickRideDefaults([], []).defaultBikeId).toBeNull();
  });
});

describe("ride figures", () => {
  const ride = (fields: Partial<RideUsage>): RideUsage => ({
    id: 1,
    startedAt: day(12),
    liftAssisted: false,
    distanceM: 20_000,
    descentDistanceM: null,
    totalTimeS: 7200,
    movingTimeS: null,
    descentTimeS: null,
    ...fields,
  });

  it("adds this month's distance and duration", () => {
    const rides = [ride({ startedAt: day(1) - 86_400_000 }), ride({}), ride({ movingTimeS: 3600 })];
    expect(ridingSince(rides, Date.UTC(2026, 9, 1))).toEqual({
      distanceM: 40_000,
      durationS: 10_800,
    });
  });

  it("shows the wear of a bike park day only when it differs from its duration", () => {
    expect(shownWearS(ride({ liftAssisted: true, totalTimeS: 21_600, descentTimeS: 7800 }))).toBe(
      7800,
    );
    expect(shownWearS(ride({ liftAssisted: true, totalTimeS: 21_600 }))).toBeNull();
    expect(shownWearS(ride({ descentTimeS: 3600 }))).toBeNull();
  });
});
