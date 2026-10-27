import "server-only";
import type { MovementKind, RuleStatus } from "@/lib/enums";
import type { LocalDate } from "@/lib/format";

// Workshop logic (D-33 to D-42): quantities from movements, the restocking state, and the order
// of "À racheter".

export type Movement = {
  id: number;
  occurredAt: number;
  kind: MovementKind;
  quantityDelta: number;
  unitCostCents: number | null;
};

export type RebuyState = "to_order" | "ordered" | "low_stock";

/** The quantity in stock: the sum of the movements, never a stored total (D-39). */
export function stockQuantity(movements: Pick<Movement, "quantityDelta">[]): number {
  return movements.reduce((sum, movement) => sum + movement.quantityDelta, 0);
}

/** The price of the latest purchase that has one: the cost of a part taken from stock (D-38). */
export function lastUnitCostCents(movements: Movement[]): number | null {
  const purchases = movements
    .filter((movement) => movement.kind === "purchase" && movement.unitCostCents != null)
    .sort((a, b) => b.occurredAt - a.occurredAt || b.id - a.id);
  return purchases[0]?.unitCostCents ?? null;
}

/**
 * What the workshop shows for an item: its restocking step, else "Stock bas" when the quantity is
 * at or below its alert level, a suggestion only (D-35).
 */
export function rebuyState(
  item: { restockStatus: "none" | "to_order" | "ordered"; lowStockThreshold: number | null },
  quantity: number,
): RebuyState | null {
  if (item.restockStatus !== "none") return item.restockStatus;
  return item.lowStockThreshold != null && quantity <= item.lowStockThreshold ? "low_stock" : null;
}

/** Whether an item serves a bike: all bikes, or that one among its bikes. */
export function servesBike(item: { allBikes: boolean; bikeIds: number[] }, bikeId: number) {
  return item.allBikes || item.bikeIds.includes(bikeId);
}

export type RuleNeed = {
  status: Extract<RuleStatus, "overdue" | "due_soon">;
  dueOn: LocalDate | null;
};

/**
 * "À racheter", most urgent first (D-41): needed by a late rule, by a due-soon rule, then to
 * order, ordered, low stock. Items without a restocking state or low stock are left out.
 */
export function rebuyOrder<
  T extends { name: string; state: RebuyState | null; need: RuleNeed | null },
>(items: T[]): T[] {
  const rank = (item: T) =>
    item.need?.status === "overdue"
      ? 0
      : item.need?.status === "due_soon"
        ? 1
        : { to_order: 2, ordered: 3, low_stock: 4 }[item.state!];
  return items
    .filter((item) => item.state != null)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "fr"));
}
