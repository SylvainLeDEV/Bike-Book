import { describe, expect, it } from "vitest";
import {
  lastUnitCostCents,
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
    expect(rebuyState({ restockStatus: "ordered", lowStockThreshold: 1 }, 0)).toBe("ordered");
    expect(rebuyState({ restockStatus: "none", lowStockThreshold: 1 }, 1)).toBe("low_stock");
    expect(rebuyState({ restockStatus: "none", lowStockThreshold: 1 }, 2)).toBeNull();
    expect(rebuyState({ restockStatus: "none", lowStockThreshold: null }, 0)).toBeNull();
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
});
