import { describe, expect, it } from "vitest";
import { computeTotalCost, type CostEvent } from "./cost";

const events: CostEvent[] = [
  { id: 2, on: "2025-06-06", title: "Chaîne remplacée", shopName: null, costCents: 4490 },
  { id: 1, on: "2025-03-02", title: "Révision", shopName: "Cycles du Lac", costCents: 18_900 },
  { id: 3, on: "2025-08-20", title: "Purge", shopName: null, costCents: null },
];

describe("computeTotalCost (D-44)", () => {
  it("adds purchase and maintenance, per 100 km with and without the purchase", () => {
    const cost = computeTotalCost({
      purchasePriceCents: 429_900,
      salePriceCents: null,
      events,
      riddenDistanceM: 2_846_000,
      rideCount: 64,
    });
    expect(cost.shopCents).toBe(18_900);
    expect(cost.shopVisits).toBe(1);
    expect(cost.homeCents).toBe(4490);
    expect(cost.homeEvents).toBe(2);
    expect(cost.upkeepCents).toBe(23_390);
    expect(cost.totalCents).toBe(453_290);
    // 4 532,90 € over 2 846 km = 159,27 € per 100 km.
    expect(cost.per100KmCents).toBe(15_927);
    expect(cost.per100KmUpkeepCents).toBe(822);
    // Oldest first, a missing price counting as zero.
    expect(cost.events.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(cost.events[2].costCents).toBe(0);
  });

  it("deducts the sale price of a sold bike", () => {
    const cost = computeTotalCost({
      purchasePriceCents: 100_000,
      salePriceCents: 60_000,
      events: [],
      riddenDistanceM: 1_000_000,
      rideCount: 10,
    });
    expect(cost.totalCents).toBe(40_000);
    expect(cost.per100KmCents).toBe(4000);
    expect(cost.per100KmUpkeepCents).toBe(0);
  });

  it("shows no cost per 100 km before the first ride, and counts a missing purchase as zero", () => {
    const cost = computeTotalCost({
      purchasePriceCents: null,
      salePriceCents: null,
      events: [],
      riddenDistanceM: 0,
      rideCount: 0,
    });
    expect(cost.totalCents).toBe(0);
    expect(cost.per100KmCents).toBeNull();
    expect(cost.per100KmUpkeepCents).toBeNull();
  });
});
