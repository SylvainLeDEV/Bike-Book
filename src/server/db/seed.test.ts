import { describe, expect, it } from "vitest";
import { findAccessContext, listBikes, listShops } from "./index";
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
