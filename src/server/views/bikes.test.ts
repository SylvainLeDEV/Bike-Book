import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import {
  createBike,
  createRide,
  createRule,
  snoozeRule,
  type BikeData,
  type RideData,
} from "@/server/db";
import { getBikesPageVM } from "./bikes";
import { getDashboardVM } from "./dashboard";

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

  it("says what is overdue on the card, as the dashboard does, and nothing once snoozed", () => {
    const ctx = createTestContext("bikes-page-alert");
    const created = createBike(ctx, bike);
    if (!created.ok) throw new Error("bike");
    expect(getBikesPageVM(ctx).active[0].alert).toBeNull();

    const rule = createRule(ctx, created.bikeId, {
      componentTypeCode: null,
      position: null,
      procedureId: null,
      title: "Contrôle général du vélo",
      intervalDistanceM: null,
      intervalWearS: null,
      intervalDays: 365,
      warnRatio: 0.9,
      resetOnReplacement: false,
      counterStartAt: Date.parse("2024-03-13T23:00:00Z"),
      active: true,
      notes: null,
    });
    if (!rule.ok) throw new Error(rule.reason);
    expect(getBikesPageVM(ctx).active[0].alert).toEqual({ status: "overdue", count: 1 });
    expect(getDashboardVM(ctx).bikes[0].alert).toEqual({ status: "overdue", count: 1 });

    snoozeRule(ctx, rule.ruleId, "2099-01-01");
    expect(getBikesPageVM(ctx).active[0].alert).toBeNull();
  });
});
