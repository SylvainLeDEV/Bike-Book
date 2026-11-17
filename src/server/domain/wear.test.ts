import { describe, expect, it } from "vitest";
import { componentCounter, odometerAt, rideWear, usageBetween, type RideUsage } from "./wear";

const H = 3600;
let nextId = 1;
function ride(fields: Partial<RideUsage>): RideUsage {
  return {
    id: nextId++,
    startedAt: Date.parse("2026-06-14T10:00:00Z"),
    liftAssisted: false,
    distanceM: null,
    descentDistanceM: null,
    totalTimeS: null,
    movingTimeS: null,
    descentTimeS: null,
    ...fields,
  };
}

describe("rideWear (D-13)", () => {
  it("counts the descent time on lift-assisted rides when it is entered", () => {
    expect(
      rideWear(ride({ liftAssisted: true, totalTimeS: 6 * H, descentTimeS: 2 * H + 600 })),
    ).toEqual({ distanceM: 0, wearS: 2 * H + 600 });
  });

  it("falls back to the moving time, then the total time", () => {
    expect(
      rideWear(ride({ liftAssisted: true, totalTimeS: 6 * H, movingTimeS: 4 * H })).wearS,
    ).toBe(4 * H);
    expect(rideWear(ride({ liftAssisted: true, totalTimeS: 6 * H })).wearS).toBe(6 * H);
    expect(rideWear(ride({ movingTimeS: 2.5 * H, totalTimeS: 3 * H })).wearS).toBe(2.5 * H);
  });

  it("ignores the descent time when the ride had no lift", () => {
    expect(rideWear(ride({ totalTimeS: 3 * H, descentTimeS: H })).wearS).toBe(3 * H);
  });

  it("uses the descent distance the same way", () => {
    expect(
      rideWear(ride({ liftAssisted: true, distanceM: 41_000, descentDistanceM: 28_000 })).distanceM,
    ).toBe(28_000);
    expect(rideWear(ride({ liftAssisted: true, distanceM: 41_000 })).distanceM).toBe(41_000);
  });

  it("reproduces the worked example of docs/03: 45 h 10, or 33 h 10 with descent times", () => {
    const park = ride({ liftAssisted: true, totalTimeS: 6 * H, descentTimeS: 2 * H + 10 * 60 });
    const trail = Array.from({ length: 10 }, () => ride({ movingTimeS: 2.5 * H }));
    const parkWithout = Array.from({ length: 3 }, () =>
      ride({ liftAssisted: true, totalTimeS: 6 * H }),
    );
    expect(usageBetween([park, ...trail, ...parkWithout], null, null).wearS).toBe(45 * H + 10 * 60);
    const parkWith = parkWithout.map((r) => ({ ...r, descentTimeS: 2 * H }));
    expect(usageBetween([park, ...trail, ...parkWith], null, null).wearS).toBe(33 * H + 10 * 60);
  });
});

describe("componentCounter", () => {
  const morning = ride({ startedAt: Date.parse("2026-09-15T08:00:00Z"), distanceM: 30_000 });
  const evening = ride({ startedAt: Date.parse("2026-09-15T18:00:00Z"), distanceM: 20_000 });
  const fittedAt = Date.parse("2026-09-15T16:00:00Z");

  it("counts the rides between fitting and removal, plus its initial usage", () => {
    const part = {
      installedAt: fittedAt,
      removedAt: null,
      initialDistanceM: 5000,
      initialWearS: 0,
    };
    expect(componentCounter(part, [morning, evening])).toMatchObject({
      distanceM: 25_000,
      rideIds: [evening.id],
    });
  });

  it("stops at removal, a ride at the very instant of fitting counting for the new part", () => {
    const old = { installedAt: 0, removedAt: fittedAt, initialDistanceM: 0, initialWearS: 0 };
    const atFitting = ride({ startedAt: fittedAt, distanceM: 1000 });
    expect(componentCounter(old, [morning, atFitting, evening]).distanceM).toBe(30_000);
  });
});

describe("odometerAt (D-107)", () => {
  const bike = { initialDistanceM: 1_000_000, initialWearS: 50 * H };
  const rides = [
    ride({ startedAt: Date.parse("2026-06-10T08:00:00Z"), distanceM: 40_000, movingTimeS: 2 * H }),
    ride({
      startedAt: Date.parse("2026-06-12T08:00:00Z"),
      liftAssisted: true,
      distanceM: 30_000,
      descentDistanceM: 12_000,
      totalTimeS: 6 * H,
      descentTimeS: H,
    }),
    ride({ startedAt: Date.parse("2026-06-14T08:00:00Z"), distanceM: 50_000, movingTimeS: 3 * H }),
  ];

  it("adds the counters before tracking to the wear of the rides started before the instant", () => {
    expect(odometerAt(bike, rides, Date.parse("2026-06-13T20:00:00Z"))).toEqual({
      distanceM: 1_052_000,
      wearS: 53 * H,
      rideCount: 2,
    });
  });

  it("leaves out a ride that starts at the instant itself", () => {
    expect(odometerAt(bike, rides, Date.parse("2026-06-14T08:00:00Z")).rideCount).toBe(2);
  });

  it("is the counters before tracking when no ride came before", () => {
    expect(odometerAt(bike, rides, Date.parse("2026-06-01T00:00:00Z"))).toEqual({
      distanceM: 1_000_000,
      wearS: 50 * H,
      rideCount: 0,
    });
  });
});
