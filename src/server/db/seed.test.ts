import { describe, expect, it } from "vitest";
import {
  findAccessContext,
  listBikes,
  listComponents,
  listMaintenanceEvents,
  listRides,
  listShops,
} from "./index";
import { DEMO_ACCOUNT, seedDemoData, weeksShift } from "./seed";
import { getDb } from "./client";
import { users } from "./schema";
import { eq } from "drizzle-orm";

function demoContext() {
  const user = getDb().select().from(users).where(eq(users.email, DEMO_ACCOUNT.email)).get();
  return user ? findAccessContext(user) : null;
}

describe("demo seed", () => {
  it("shifts the fixtures' dates by whole weeks only", () => {
    expect(weeksShift("2026-10-25")).toBe(0);
    expect(weeksShift("2026-10-31")).toBe(0);
    expect(weeksShift("2026-11-01")).toBe(7);
    expect(weeksShift("2026-10-24")).toBe(-7);
  });

  it("creates the demo garage with the three bikes of /design", async () => {
    expect(await seedDemoData({ today: "2026-11-08" })).toMatchObject({ created: true });
    const ctx = demoContext()!;
    expect(ctx.workspace.name).toBe("Mon garage");
    const bikes = listBikes(ctx);
    expect(bikes.map((b) => b.name)).toEqual(["Spectral", "Le Lourd", "Gravel alu"]);
    // Two weeks after the fixtures' Sunday: every date moves by 14 days.
    expect(bikes[0]).toMatchObject({ purchasedOn: "2024-03-28", statusChangedOn: "2024-03-28" });
    expect(listShops(ctx).map((s) => s.name)).toEqual(["Cycles du Lac", "Rayon Libre"]);

    // The Spectral's parts and their history (D-43), moved by the same two weeks.
    const spectral = bikes[0].id;
    const parts = listComponents(ctx, spectral);
    expect(parts.filter((p) => p.removedAt == null)).toHaveLength(11);
    expect(parts.filter((p) => p.typeCode === "chain").map((p) => p.removalNote)).toEqual([
      "allongement 0,6 %",
      "allongement 0,5 %",
      null,
    ]);
    const events = listMaintenanceEvents(ctx, spectral);
    expect(events.map((e) => [e.performedOn, e.title, e.items.length])).toEqual([
      ["2026-10-26", "Chaîne et plaquettes avant remplacées", 2],
      ["2026-10-10", "Purge des freins avant et arrière", 2],
      ["2026-09-29", "Dérailleur et pneu arrière remplacés", 2],
      ["2026-07-28", "Plaquettes arrière remplacées", 1],
      ["2026-03-16", "Entretien fourche et amortisseur", 2],
      ["2025-06-20", "Chaîne remplacée", 1],
      ["2025-05-16", "Plaquettes avant remplacées", 1],
      ["2025-05-02", "Pneu avant remplacé", 1],
      ["2025-03-28", "Révision des 1 an", 2],
    ]);
    // The nine costed events of /design add up to 1 284,00 €.
    const cost = events.reduce(
      (sum, e) => sum + (e.totalCostCents ?? e.items.reduce((s, i) => s + (i.costCents ?? 0), 0)),
      0,
    );
    expect(cost).toBe(128_400);

    // Rides: about the 2 846 km of /design on the Spectral, Les Gets as a bike park day.
    const rides = listRides(ctx, { bikeId: spectral });
    const km = rides.reduce((sum, ride) => sum + (ride.distanceM ?? 0), 0) / 1000;
    expect(km).toBeGreaterThan(2830);
    expect(km).toBeLessThan(2860);
    expect(rides.find((ride) => ride.location === "Les Gets")).toMatchObject({
      rideType: "bike_park",
      liftAssisted: true,
      runsCount: 14,
      descentTimeS: 7800,
    });
  });

  it("leaves an existing demo account alone, unless asked to reset it", async () => {
    expect(await seedDemoData()).toMatchObject({ created: false });
    const before = demoContext()!.workspace.id;
    expect(await seedDemoData({ reset: true, today: "2026-10-25" })).toMatchObject({
      created: true,
    });
    const after = demoContext()!;
    expect(after.workspace.id).not.toBe(before);
    expect(listBikes(after)).toHaveLength(3);
    expect(listBikes(after)[0].purchasedOn).toBe("2024-03-14");
  });
});
