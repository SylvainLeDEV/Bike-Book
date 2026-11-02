import { describe, expect, it } from "vitest";
import { containerWords } from "./display";
import { NBSP } from "./format";
import { procedureMatches, procedureNeeds, procedureServes, readinessOf } from "./procedures";
import type { BikeRef, InventoryItemVM, ProcedureLineVM, ProcedureVM } from "./view-models";

const fr = (text: string) => text.replaceAll("~", NBSP);
const bike = (id: number): BikeRef => ({
  id,
  name: `Vélo ${id}`,
  cover: { photoUrl: null, artIndex: 0 },
});

const common = {
  photoUrl: null,
  category: "brakes" as const,
  bikes: "all" as BikeRef[] | "all",
  location: null,
  state: null,
  brand: null,
  reference: null,
  componentTypeCode: null as string | null,
  lowStockThreshold: null,
  lastUnitCostCents: null,
  restock: {
    status: "none" as const,
    quantity: null,
    changedOn: null,
    orderedOn: null,
    shopName: null,
  },
  purchaseLinks: [],
  rulesServed: [],
  lastUse: null,
  movements: [],
  notes: null,
};

const pads = (id: number, quantity: number, fields: Partial<InventoryItemVM> = {}) =>
  ({
    ...common,
    id,
    name: `Plaquettes ${id}`,
    kind: "part",
    quantity,
    unit: "pair",
    componentTypeCode: "brake_pads",
    ...fields,
  }) as InventoryItemVM;

const items: InventoryItemVM[] = [
  { ...common, id: 1, name: "Kit de purge", kind: "tool", owned: true },
  { ...common, id: 2, name: "Clé dynamométrique", kind: "tool", owned: false, state: "to_order" },
  {
    ...common,
    id: 3,
    name: "Huile minérale",
    kind: "product",
    containers: 1,
    level: "low",
    container: containerWords(null),
    state: "low_stock",
  },
  pads(4, 0, { bikes: [bike(1)] }),
  pads(5, 2, { bikes: [bike(1)] }),
  pads(6, 3, { bikes: [bike(2)] }),
];

const line = (id: number, fields: Partial<ProcedureLineVM>): ProcedureLineVM =>
  ({ id, quantity: null, target: "item", itemId: 1, ...fields }) as ProcedureLineVM;

describe("procedureNeeds (D-86)", () => {
  it("reads tools, products and parts against the workshop", () => {
    const needs = procedureNeeds(
      [
        line(1, { itemId: 1 }),
        line(2, { itemId: 2 }),
        line(3, { itemId: 3 }),
        line(4, { itemId: 4, quantity: 1 }),
      ],
      items,
      1,
    );
    expect(needs.map((need) => [need.group, need.availability, need.text, need.action])).toEqual([
      ["tool", "ok", "Possédé", null],
      // Already on "À commander": nothing more to offer.
      ["tool", "missing", "Manquant", null],
      ["product", "low", "Stock bas · presque vide", "order"],
      ["part", "missing", "Manquant", "order"],
    ]);
  });

  it("finds a part of the type for the bike, one with enough stock first", () => {
    const typed = line(1, {
      target: "type",
      componentTypeCode: "brake_pads",
      typeLabel: "Plaquettes",
      quantity: 2,
    } as Partial<ProcedureLineVM>);
    const [forOne] = procedureNeeds([typed], items, 1);
    expect(forOne).toMatchObject({
      name: "Plaquettes · Plaquettes 5",
      availability: "ok",
      text: fr("2~paires en stock"),
    });
    const [forTwo] = procedureNeeds([typed], items, 2);
    expect(forTwo.item?.id).toBe(6);
    const [forThree] = procedureNeeds([typed], items, 3);
    expect(forThree).toMatchObject({
      availability: "missing",
      text: "Pas dans l'atelier",
      action: "add",
      prefill: { kind: "part", name: "Plaquettes", componentTypeCode: "brake_pads" },
    });
  });

  it("offers to add a line typed as text to the workshop", () => {
    const [need] = procedureNeeds(
      [line(1, { target: "label", label: "Huile de fourche 15 WT" } as Partial<ProcedureLineVM>)],
      items,
      1,
    );
    expect(need).toMatchObject({
      group: "other",
      availability: "missing",
      action: "add",
      prefill: { name: "Huile de fourche 15 WT" },
    });
  });

  it("says when an item has left the workshop", () => {
    const [need] = procedureNeeds([line(1, { itemId: 99 })], items, 1);
    expect(need).toMatchObject({
      availability: "missing",
      text: "Plus dans l'atelier",
      action: null,
    });
  });
});

describe("readinessOf", () => {
  it("gives one badge: missing first, then low stock, else ready", () => {
    const needs = procedureNeeds([line(1, { itemId: 1 }), line(2, { itemId: 3 })], items, 1);
    expect(readinessOf(needs)).toEqual({ missing: 0, low: 1, label: "Stock bas" });
    expect(readinessOf(procedureNeeds([line(1, { itemId: 1 })], items, 1))?.label).toBe(
      "Matériel prêt",
    );
    expect(
      readinessOf(procedureNeeds([line(1, { itemId: 2 }), line(2, { itemId: 4 })], items, 1))
        ?.label,
    ).toBe("2 manquants");
    expect(readinessOf([])).toBeNull();
  });
});

describe("procedure search and bikes", () => {
  const procedure = {
    id: 1,
    title: "Purge des freins",
    description: null,
    componentTypeCode: "brake",
    typeLabel: "Frein",
    modelHint: "SRAM Maven",
    bikes: [bike(1)],
    estimatedDurationS: null,
    difficulty: null,
    archived: false,
    steps: [{ id: 1, instruction: "Retirer l'étrier", note: null, torqueNm: null, photoCount: 0 }],
    lines: [line(1, { itemId: 3 })],
    resources: [],
    links: [],
  } satisfies ProcedureVM;

  it("searches the title, model, steps and material, accents ignored", () => {
    expect(procedureMatches(procedure, "maven", items)).toBe(true);
    expect(procedureMatches(procedure, "etrier", items)).toBe(true);
    expect(procedureMatches(procedure, "huile", items)).toBe(true);
    expect(procedureMatches(procedure, "chaîne", items)).toBe(false);
    expect(procedureMatches(procedure, "  ", items)).toBe(true);
  });

  it("serves its bikes, or all", () => {
    expect(procedureServes(procedure, 1)).toBe(true);
    expect(procedureServes(procedure, 2)).toBe(false);
    expect(procedureServes({ bikes: "all" }, 2)).toBe(true);
  });
});
