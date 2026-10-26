import { describe, expect, it } from "vitest";
import type { BikeInput } from "@/lib/view-models";
import { parseBikeInput, toBikeData } from "./bike-input";

const TODAY = "2026-10-25";

const valid: BikeInput = {
  name: "  Le   Lourd ",
  brand: " Orbea ",
  model: "Wild H20",
  modelYear: 2025,
  discipline: "enduro",
  isElectric: true,
  status: "active",
  soldOn: null,
  salePriceCents: null,
  frameSize: "L",
  wheelSize: "29",
  color: "",
  weightG: 24_800,
  frameSerial: null,
  notes: "   ",
  purchasedOn: "2025-04-02",
  purchasePriceCents: 649_900,
  shop: { name: " Cycles du Lac ", kind: "physical" },
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
};

function errorsOf(input: unknown) {
  const parsed = parseBikeInput(input, TODAY);
  return parsed.success ? {} : parsed.fieldErrors;
}

describe("parseBikeInput", () => {
  it("cleans text: trimmed, inner spaces collapsed in names, empty becomes null", () => {
    const parsed = parseBikeInput(valid, TODAY);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      name: "Le Lourd",
      brand: "Orbea",
      color: null,
      notes: null,
      shop: { name: "Cycles du Lac", kind: "physical" },
    });
  });

  it("requires a name and refuses unknown enum values", () => {
    expect(errorsOf({ ...valid, name: "   " }).name).toBe("Donne un nom au vélo.");
    expect(errorsOf({ ...valid, discipline: "bmx" }).discipline).toBe("Choisis une discipline.");
    expect(errorsOf({ ...valid, wheelSize: "28" }).wheelSize).toBe("Taille de roue inconnue.");
  });

  it("refuses negative or fractional figures", () => {
    expect(errorsOf({ ...valid, purchasePriceCents: -1 }).purchasePriceCents).toBeDefined();
    expect(errorsOf({ ...valid, initialDistanceM: -5 }).initialDistanceM).toBeDefined();
    expect(errorsOf({ ...valid, weightG: 12.5 }).weightG).toBeDefined();
    expect(errorsOf({ ...valid, modelYear: 1850 }).modelYear).toBe("Année entre 1900 et 2100.");
  });

  it("refuses dates in the future, invalid dates and a sale before the purchase", () => {
    expect(errorsOf({ ...valid, purchasedOn: "2026-10-26" }).purchasedOn).toMatch(/futur/);
    expect(errorsOf({ ...valid, purchasedOn: "2026-02-30" }).purchasedOn).toBe("Date invalide.");
    expect(
      errorsOf({ ...valid, status: "sold", soldOn: "2025-01-01", salePriceCents: 1000 }).soldOn,
    ).toBe("La vente ne peut pas précéder l'achat.");
  });

  it("refuses something that is not a bike input at all", () => {
    expect(parseBikeInput(null, TODAY).success).toBe(false);
    expect(parseBikeInput({ name: "X" }, TODAY).success).toBe(false);
  });
});

describe("toBikeData", () => {
  it("resolves the status columns and keeps the shop for the data-access layer", () => {
    const parsed = parseBikeInput(
      { ...valid, status: "sold", soldOn: "2026-09-30", salePriceCents: 410_000 },
      TODAY,
    );
    if (!parsed.success) throw new Error("expected a valid input");
    const data = toBikeData(parsed.data, null, TODAY);
    expect(data).toMatchObject({
      status: "sold",
      statusChangedOn: "2026-09-30",
      salePriceCents: 410_000,
      purchaseShop: { name: "Cycles du Lac", kind: "physical" },
    });
    expect(data).not.toHaveProperty("soldOn");
    expect(data).not.toHaveProperty("shop");
  });
});
