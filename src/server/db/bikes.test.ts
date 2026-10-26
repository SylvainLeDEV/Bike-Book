import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import { getDb } from "./client";
import { createBike, getBike, listBikes, listShops, updateBike, type BikeData } from "./index";
import { bikes } from "./schema";

const spectral: BikeData = {
  name: "Spectral",
  discipline: "enduro",
  isElectric: false,
  brand: "Canyon",
  model: "Spectral 29 CF",
  modelYear: 2024,
  frameSize: "L",
  wheelSize: "29",
  color: "Bleu nuit mat",
  frameSerial: "CN24 7Q3M 8K41",
  weightG: 15_200,
  purchasedOn: "2024-03-14",
  purchasePriceCents: 429_900,
  purchaseShop: { name: "Rayon Libre", kind: "online" },
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
  status: "active",
  statusChangedOn: "2024-03-14",
  salePriceCents: null,
  notes: null,
};

function created(outcome: ReturnType<typeof createBike>): number {
  if (!outcome.ok) throw new Error(`Bike not created: ${outcome.reason}`);
  return outcome.bikeId;
}

describe("bikes", () => {
  it("creates a bike with its new shop and reads it back", () => {
    const ctx = createTestContext("Camille");
    const id = created(createBike(ctx, spectral));

    const bike = getBike(ctx, id);
    expect(bike).toMatchObject({
      name: "Spectral",
      wheelSize: "29",
      purchasePriceCents: 429_900,
      purchaseShop: { name: "Rayon Libre", kind: "online" },
    });
    expect(listBikes(ctx).map((b) => b.name)).toEqual(["Spectral"]);
    expect(listShops(ctx)).toEqual([
      { id: bike!.purchaseShop!.id, name: "Rayon Libre", kind: "online" },
    ]);
  });

  it("reuses a shop of the same name, whatever the case and accents", () => {
    const ctx = createTestContext("Dominique");
    created(createBike(ctx, spectral));
    const id = created(
      createBike(ctx, {
        ...spectral,
        name: "Gravel alu",
        purchaseShop: { name: "  rayon   LIBRE ", kind: "physical" },
      }),
    );
    expect(listShops(ctx)).toHaveLength(1);
    expect(getBike(ctx, id)?.purchaseShop).toMatchObject({ name: "Rayon Libre", kind: "online" });
  });

  it("refuses a second bike with the same name, case and accents ignored", () => {
    const ctx = createTestContext("Alex");
    created(createBike(ctx, { ...spectral, name: "Le Lourd" }));
    expect(createBike(ctx, { ...spectral, name: "  le   lourd" })).toEqual({
      ok: false,
      reason: "name_taken",
      takenBy: "Le Lourd",
    });
    const other = created(createBike(ctx, { ...spectral, name: "Spectral" }));
    expect(updateBike(ctx, other, { ...spectral, name: "Le Lourd" })).toEqual({
      ok: false,
      reason: "name_taken",
      takenBy: "Le Lourd",
    });
    // Keeping its own name is not a conflict.
    expect(updateBike(ctx, other, { ...spectral, name: "spectral" })).toEqual({
      ok: true,
      bikeId: other,
    });
    expect(getBike(ctx, other)?.name).toBe("spectral");
  });

  it("updates a bike and can clear its shop", () => {
    const ctx = createTestContext("Sam");
    const id = created(createBike(ctx, spectral));
    updateBike(ctx, id, {
      ...spectral,
      status: "sold",
      statusChangedOn: "2026-09-30",
      salePriceCents: 210_000,
      purchaseShop: null,
    });
    expect(getBike(ctx, id)).toMatchObject({
      status: "sold",
      statusChangedOn: "2026-09-30",
      salePriceCents: 210_000,
      purchaseShop: null,
    });
  });

  it("keeps each workspace's bikes and shops to itself", () => {
    const owner = createTestContext("Owner");
    const intruder = createTestContext("Intruder");
    const id = created(createBike(owner, spectral));

    expect(listBikes(intruder)).toEqual([]);
    expect(getBike(intruder, id)).toBeNull();
    expect(listShops(intruder)).toEqual([]);
    expect(updateBike(intruder, id, { ...spectral, name: "Volé" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(getBike(owner, id)?.name).toBe("Spectral");

    // Same bike and shop names in another workspace: allowed, and the shop is its own.
    const theirs = created(createBike(intruder, spectral));
    expect(getBike(intruder, theirs)?.purchaseShop?.id).not.toBe(
      getBike(owner, id)?.purchaseShop?.id,
    );
  });

  it("lets the database refuse a sale price on a bike that is not sold", () => {
    const ctx = createTestContext("Check");
    expect(() =>
      getDb()
        .insert(bikes)
        .values({
          workspaceId: ctx.workspace.id,
          name: "Test",
          discipline: "trail",
          status: "active",
          salePriceCents: 1000,
        })
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });
});
