import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import { getDb } from "./client";
import {
  createBike,
  createRide,
  listRides,
  listRideUsages,
  deleteRide,
  updateRide,
  type BikeData,
  type RideData,
} from "./index";
import { rides } from "./schema";

const bike = {
  name: "Gravel alu",
  discipline: "gravel",
  isElectric: false,
  brand: null,
  model: null,
  modelYear: null,
  frameSize: null,
  wheelSize: null,
  color: null,
  frameSerial: null,
  weightG: null,
  purchasedOn: null,
  purchasePriceCents: null,
  purchaseShop: null,
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
  status: "active",
  statusChangedOn: null,
  salePriceCents: null,
  notes: null,
} satisfies BikeData;

const ride = (bikeId: number, startedAt: string): RideData => ({
  bikeId,
  startedAt: Date.parse(startedAt),
  title: null,
  location: "Boucle du plateau",
  rideType: "gravel",
  liftAssisted: false,
  distanceM: 62_000,
  descentDistanceM: null,
  totalTimeS: 9900,
  movingTimeS: null,
  descentTimeS: null,
  runsCount: null,
  elevationGainM: 640,
  elevationLossM: null,
  conditions: "dry",
  notes: null,
});

function setup(name: string) {
  const ctx = createTestContext(name);
  const created = createBike(ctx, bike);
  if (!created.ok) throw new Error("bike");
  return { ctx, bikeId: created.bikeId };
}

describe("rides", () => {
  it("adds rides and lists them newest first, or in time order for the counters", () => {
    const { ctx, bikeId } = setup("Camille");
    const first = createRide(ctx, ride(bikeId, "2026-10-10T10:00:00Z"));
    const second = createRide(ctx, ride(bikeId, "2026-10-20T10:00:00Z"));
    if (!first.ok || !second.ok) throw new Error("ride");
    expect(listRides(ctx).map((r) => r.id)).toEqual([second.rideId, first.rideId]);
    expect(listRides(ctx, { bikeId, limit: 1 })[0]).toMatchObject({
      id: second.rideId,
      source: "manual",
      distanceM: 62_000,
    });
    expect(listRideUsages(ctx, bikeId).map((r) => r.id)).toEqual([first.rideId, second.rideId]);
  });

  it("undoes a ride entered by hand", () => {
    const { ctx, bikeId } = setup("Undo");
    const created = createRide(ctx, ride(bikeId, "2026-10-10T10:00:00Z"));
    if (!created.ok) throw new Error("ride");
    expect(deleteRide(ctx, created.rideId)).toEqual({ ok: true });
    expect(listRides(ctx)).toEqual([]);
    expect(deleteRide(ctx, created.rideId)).toEqual({ ok: false, reason: "not_found" });
  });

  it("edits a ride, moves it to another bike of the workspace, keeps what the sheet does not show", () => {
    const { ctx, bikeId } = setup("Edit");
    const other = createBike(ctx, { ...bike, name: "Enduro carbone" });
    if (!other.ok) throw new Error("bike");
    const created = createRide(ctx, {
      ...ride(bikeId, "2026-10-10T10:00:00Z"),
      title: "Imported title",
      movingTimeS: 9000,
    });
    if (!created.ok) throw new Error("ride");
    const edit = {
      ...ride(other.bikeId, "2026-10-09T10:00:00Z"),
      location: null,
      distanceM: 30_000,
      conditions: null,
    };
    expect(updateRide(ctx, created.rideId, edit)).toEqual({ ok: true });
    expect(listRides(ctx)[0]).toMatchObject({
      id: created.rideId,
      bikeId: other.bikeId,
      startedAt: Date.parse("2026-10-09T10:00:00Z"),
      location: null,
      distanceM: 30_000,
      conditions: null,
      title: "Imported title",
      movingTimeS: 9000,
    });
    expect(listRideUsages(ctx, bikeId)).toEqual([]);

    // A new "Durée" replaces the moving time, which would still be shown and counted.
    expect(updateRide(ctx, created.rideId, { ...edit, totalTimeS: 5400 })).toEqual({ ok: true });
    expect(listRides(ctx)[0]).toMatchObject({ totalTimeS: 5400, movingTimeS: null });
  });

  it("keeps each workspace's rides to itself", () => {
    const { ctx: owner, bikeId } = setup("Owner");
    const { ctx: intruder, bikeId: theirs } = setup("Intruder");
    const created = createRide(owner, ride(bikeId, "2026-10-10T10:00:00Z"));
    if (!created.ok) throw new Error("ride");
    expect(listRides(intruder)).toEqual([]);
    expect(listRides(intruder, { bikeId })).toEqual([]);
    expect(listRideUsages(intruder, bikeId)).toEqual([]);
    expect(createRide(intruder, ride(bikeId, "2026-10-11T10:00:00Z"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(deleteRide(intruder, created.rideId)).toEqual({ ok: false, reason: "not_found" });
    // Neither someone else's ride, nor one's ride moved to someone else's bike.
    expect(updateRide(intruder, created.rideId, ride(theirs, "2026-10-11T10:00:00Z"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(updateRide(owner, created.rideId, ride(theirs, "2026-10-11T10:00:00Z"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(listRides(owner)).toHaveLength(1);
    expect(createRide(intruder, ride(theirs, "2026-10-11T10:00:00Z")).ok).toBe(true);
  });

  it("lets the database refuse a ride without duration or with a descent longer than the day", () => {
    const { bikeId } = setup("Checks");
    const insert = (values: Partial<typeof rides.$inferInsert>) => () =>
      getDb()
        .insert(rides)
        .values({
          bikeId,
          startedAt: new Date(),
          rideType: "bike_park",
          totalTimeS: 3600,
          ...values,
        })
        .run();
    expect(insert({ totalTimeS: null })).toThrow(/CHECK constraint failed/);
    expect(insert({ descentTimeS: 7200 })).toThrow(/CHECK constraint failed/);
    expect(insert({ distanceM: -1 })).toThrow(/CHECK constraint failed/);
    expect(insert({ rideType: "skate" as "trail" })).toThrow(/CHECK constraint failed/);
  });
});
