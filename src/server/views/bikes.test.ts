import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import { createBike, createRide, type BikeData, type RideData } from "@/server/db";
import { getBikesPageVM } from "./bikes";

const bike = {
  name: "Spectral",
  discipline: "enduro",
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

const ride = (bikeId: number, startedAt: number): RideData => ({
  bikeId,
  startedAt,
  title: null,
  location: null,
  rideType: "enduro",
  liftAssisted: false,
  distanceM: 12_000,
  descentDistanceM: null,
  totalTimeS: 4320,
  movingTimeS: null,
  descentTimeS: null,
  runsCount: null,
  elevationGainM: null,
  elevationLossM: null,
  conditions: null,
  notes: null,
});

describe("getBikesPageVM", () => {
  it("shows this month's riding on the card, not last month's", () => {
    const ctx = createTestContext("bikes-page-month");
    const created = createBike(ctx, bike);
    if (!created.ok) throw new Error("bike");
    const now = Date.now();
    createRide(ctx, ride(created.bikeId, now));
    createRide(ctx, ride(created.bikeId, now - 62 * 24 * 3600 * 1000));

    const [card] = getBikesPageVM(ctx).active;
    expect(card.monthDistanceM).toBe(12_000);
    expect(card.monthDurationS).toBe(4320);
  });

  it("shows no riding for a bike without rides", () => {
    const ctx = createTestContext("bikes-page-empty");
    createBike(ctx, bike);

    const [card] = getBikesPageVM(ctx).active;
    expect(card.monthDistanceM).toBe(0);
    expect(card.monthDurationS).toBe(0);
  });
});
