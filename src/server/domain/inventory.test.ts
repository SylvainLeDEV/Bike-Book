import { describe, expect, it } from "vitest";
import {
  containersChange,
  isLowStock,
  itemStock,
  lastUnitCostCents,
  levelChange,
  ownedChange,
  productStock,
  rebuyOrder,
  rebuyState,
  servesBike,
  stockQuantity,
  type Movement,
} from "./inventory";

const movement = (fields: Partial<Movement> & Pick<Movement, "id">): Movement => ({
  occurredAt: fields.id * 1000,
  kind: "purchase",
  quantityDelta: 1,
  unitCostCents: null,
  ...fields,
});

describe("workshop", () => {
  it("computes the stock from the movements (D-39)", () => {
    const movements = [
      movement({ id: 1, kind: "initial", quantityDelta: 2 }),
      movement({ id: 2, kind: "use", quantityDelta: -1 }),
      movement({ id: 3, kind: "purchase", quantityDelta: 3, unitCostCents: 2200 }),
      movement({ id: 4, kind: "adjustment", quantityDelta: -1 }),
    ];
    expect(stockQuantity(movements)).toBe(3);
    expect(stockQuantity([])).toBe(0);
  });

  it("costs a part at its latest purchase price (D-38)", () => {
    expect(
      lastUnitCostCents([
        movement({ id: 1, unitCostCents: 1900 }),
        movement({ id: 2, unitCostCents: 2200 }),
        movement({ id: 3, unitCostCents: null }),
        movement({ id: 4, kind: "use", quantityDelta: -1, unitCostCents: 9999 }),
      ]),
    ).toBe(2200);
    expect(lastUnitCostCents([movement({ id: 1 })])).toBeNull();
  });

  it("shows the restocking step first, then low stock as a suggestion (D-35)", () => {
    const part = (quantity: number) => ({ kind: "part" as const, quantity });
    expect(rebuyState({ restockStatus: "ordered", lowStockThreshold: 1 }, part(0))).toBe("ordered");
    expect(rebuyState({ restockStatus: "none", lowStockThreshold: 1 }, part(1))).toBe("low_stock");
    expect(rebuyState({ restockStatus: "none", lowStockThreshold: 1 }, part(2))).toBeNull();
    expect(rebuyState({ restockStatus: "none", lowStockThreshold: null }, part(0))).toBeNull();
    expect(
      rebuyState(
        { restockStatus: "to_order", lowStockThreshold: null },
        { kind: "tool", owned: false },
      ),
    ).toBe("to_order");
  });

  it("serves all bikes or its own", () => {
    expect(servesBike({ allBikes: true, bikeIds: [] }, 3)).toBe(true);
    expect(servesBike({ allBikes: false, bikeIds: [1, 2] }, 2)).toBe(true);
    expect(servesBike({ allBikes: false, bikeIds: [1, 2] }, 3)).toBe(false);
  });

  it("orders 'À racheter' by urgency (D-41)", () => {
    const rows = [
      { name: "Chambre à air", state: "low_stock" as const, need: null },
      { name: "Cassette", state: "ordered" as const, need: null },
      {
        name: "Liquide préventif",
        state: "to_order" as const,
        need: { status: "due_soon" as const, dueOn: "2026-10-30" },
      },
      { name: "Plaquettes", state: "to_order" as const, need: null },
      {
        name: "Chaîne",
        state: "low_stock" as const,
        need: { status: "overdue" as const, dueOn: null },
      },
      { name: "Pompe", state: null, need: null },
    ];
    expect(rebuyOrder(rows).map((row) => row.name)).toEqual([
      "Chaîne",
      "Liquide préventif",
      "Plaquettes",
      "Cassette",
      "Chambre à air",
    ]);
  });

  describe("products and tools (D-36, D-40, D-85)", () => {
    it("reads a product's open container from its latest level", () => {
      expect(productStock([])).toEqual({ containers: 0, level: "empty" });
      expect(productStock([movement({ id: 1, kind: "initial", quantityDelta: 2 })])).toEqual({
        containers: 2,
        level: "full",
      });
      expect(
        productStock([
          movement({ id: 1, kind: "initial", quantityDelta: 2, levelAfter: "started" }),
          movement({ id: 2, kind: "use", quantityDelta: 0, levelAfter: "low" }),
          movement({ id: 3, kind: "purchase", quantityDelta: 1 }),
        ]),
      ).toEqual({ containers: 3, level: "low" });
      // The last one ran out, then one was bought: it is full.
      expect(
        productStock([
          movement({ id: 1, kind: "initial", quantityDelta: 1 }),
          movement({ id: 2, kind: "use", quantityDelta: -1, levelAfter: "empty" }),
          movement({ id: 3, kind: "purchase", quantityDelta: 1 }),
        ]),
      ).toEqual({ containers: 1, level: "full" });
    });

    it("reads a tool's possession from its movements", () => {
      expect(itemStock("tool", [])).toEqual({ kind: "tool", owned: false });
      expect(itemStock("tool", [movement({ id: 1, kind: "initial", quantityDelta: 1 })])).toEqual({
        kind: "tool",
        owned: true,
      });
      expect(itemStock("part", [movement({ id: 1, quantityDelta: 3 })])).toEqual({
        kind: "part",
        quantity: 3,
      });
    });

    it("writes a level picked by eye as a use going down, a correction going up", () => {
      const open = { containers: 2, level: "started" as const };
      expect(levelChange(open, "low")).toEqual({
        kind: "use",
        quantityDelta: 0,
        levelAfter: "low",
      });
      expect(levelChange(open, "full")).toEqual({
        kind: "adjustment",
        quantityDelta: 0,
        levelAfter: "full",
      });
      expect(levelChange(open, "started")).toBeNull();
      expect(levelChange({ containers: 0, level: "empty" }, "low")).toBeNull();
    });

    it("finishes the open container with « Vide »: the next one opens full", () => {
      expect(levelChange({ containers: 2, level: "low" }, "empty")).toEqual({
        kind: "use",
        quantityDelta: -1,
        levelAfter: "full",
      });
      expect(levelChange({ containers: 1, level: "low" }, "empty")).toEqual({
        kind: "use",
        quantityDelta: -1,
        levelAfter: "empty",
      });
    });

    it("moves containers: the first in opens full, the last out empties it", () => {
      expect(containersChange(0, 2, "purchase")).toEqual({
        kind: "purchase",
        quantityDelta: 2,
        levelAfter: "full",
      });
      expect(containersChange(2, -1, "use")).toEqual({
        kind: "use",
        quantityDelta: -1,
        levelAfter: null,
      });
      expect(containersChange(1, -1, "use")).toEqual({
        kind: "use",
        quantityDelta: -1,
        levelAfter: "empty",
      });
      expect(containersChange(0, -1, "use")).toBeNull();
      expect(containersChange(3, 0, "adjustment")).toBeNull();
    });

    it("writes a tool's possession as a correction", () => {
      expect(ownedChange(0, true)).toEqual({
        kind: "adjustment",
        quantityDelta: 1,
        levelAfter: null,
      });
      expect(ownedChange(1, false)).toEqual({
        kind: "adjustment",
        quantityDelta: -1,
        levelAfter: null,
      });
      expect(ownedChange(1, true)).toBeNull();
      expect(ownedChange(0, false)).toBeNull();
    });

    it("calls a product low on its last container nearly empty, never a tool", () => {
      const item = { lowStockThreshold: null };
      const product = (containers: number, level: "full" | "started" | "low" | "empty") => ({
        kind: "product" as const,
        containers,
        level,
      });
      expect(isLowStock(item, product(0, "empty"))).toBe(true);
      expect(isLowStock(item, product(1, "low"))).toBe(true);
      expect(isLowStock(item, product(1, "started"))).toBe(false);
      expect(isLowStock(item, product(2, "low"))).toBe(false);
      expect(isLowStock(item, { kind: "tool", owned: false })).toBe(false);
    });
  });
});
