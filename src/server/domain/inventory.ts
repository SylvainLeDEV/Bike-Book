import "server-only";
import type { InventoryKind, MovementKind, ProductLevel, RuleStatus } from "@/lib/enums";
import type { LocalDate } from "@/lib/format";

// Workshop logic (D-33 to D-42, D-85): quantities from movements, a product's open container,
// a tool's possession, the restocking state, and the order of "À racheter".

export type Movement = {
  id: number;
  occurredAt: number;
  kind: MovementKind;
  quantityDelta: number;
  unitCostCents: number | null;
  /** Products: the open container's level after this movement, when it set one. */
  levelAfter?: ProductLevel | null;
};

/** What an item holds, by kind: computed from its movements, never stored (D-39). */
export type ItemStock =
  | { kind: "part"; quantity: number }
  | { kind: "product"; containers: number; level: ProductLevel }
  | { kind: "tool"; owned: boolean };

/** The movement an action writes (D-85): its kind, its delta, the level it sets. */
export type StockChange = {
  kind: Exclude<MovementKind, "initial">;
  quantityDelta: number;
  levelAfter: ProductLevel | null;
};

const LEVEL_RANK: Record<ProductLevel, number> = { empty: 0, low: 1, started: 2, full: 3 };

export type RebuyState = "to_order" | "ordered" | "low_stock";

/** The quantity in stock: the sum of the movements, never a stored total (D-39). */
export function stockQuantity(movements: Pick<Movement, "quantityDelta">[]): number {
  return movements.reduce((sum, movement) => sum + movement.quantityDelta, 0);
}

/**
 * A product's stock (D-36): the containers are the sum of the movements, the open one
 * included; its level is the `level_after` of the latest movement that sets one. No container
 * left is "empty"; containers without a level yet (or bought after the last one ran out) are full.
 */
export function productStock(
  movements: Pick<Movement, "id" | "occurredAt" | "quantityDelta" | "levelAfter">[],
): { containers: number; level: ProductLevel } {
  const containers = Math.max(0, stockQuantity(movements));
  if (containers === 0) return { containers, level: "empty" };
  const latest = movements
    .filter((movement) => movement.levelAfter != null)
    .sort((a, b) => b.occurredAt - a.occurredAt || b.id - a.id)[0];
  const level = latest?.levelAfter ?? "full";
  return { containers, level: level === "empty" ? "full" : level };
}

/** What an item holds, from its kind and movements. */
export function itemStock(
  kind: InventoryKind,
  movements: Pick<Movement, "id" | "occurredAt" | "quantityDelta" | "levelAfter">[],
): ItemStock {
  switch (kind) {
    case "part":
      return { kind, quantity: stockQuantity(movements) };
    case "product":
      return { kind, ...productStock(movements) };
    case "tool":
      return { kind, owned: stockQuantity(movements) > 0 };
  }
}

/**
 * The open container's new level, picked by eye (D-85): lower is a use, higher a correction,
 * both without a container; "Vide" finishes it, so one container goes and the next one is
 * opened full (or none is left). Null when nothing changes or no container is left.
 */
export function levelChange(
  current: { containers: number; level: ProductLevel },
  next: ProductLevel,
): StockChange | null {
  if (current.containers < 1 || next === current.level) return null;
  if (next === "empty") {
    return {
      kind: "use",
      quantityDelta: -1,
      levelAfter: current.containers > 1 ? "full" : "empty",
    };
  }
  return {
    kind: LEVEL_RANK[next] < LEVEL_RANK[current.level] ? "use" : "adjustment",
    quantityDelta: 0,
    levelAfter: next,
  };
}

/**
 * Containers in or out (D-85): "+" or a reception (a purchase), "−" (a use: one thrown or
 * given, the open one keeps its level), a count (a correction). The first container in opens
 * full; the last one out leaves the product empty. Null when it would go below zero.
 */
export function containersChange(
  containers: number,
  delta: number,
  kind: StockChange["kind"],
): StockChange | null {
  const after = containers + delta;
  if (delta === 0 || after < 0) return null;
  return {
    kind,
    quantityDelta: delta,
    levelAfter: after === 0 ? "empty" : containers === 0 ? "full" : null,
  };
}

/**
 * "Je l'ai" / "Je ne l'ai pas" on a tool (D-85): a correction of its possession, since nothing
 * says it was bought now (a purchase goes through "À commander", then "Reçu"). Null when it
 * changes nothing.
 */
export function ownedChange(quantity: number, owned: boolean): StockChange | null {
  if (owned === quantity > 0) return null;
  return { kind: "adjustment", quantityDelta: owned ? 1 - quantity : -quantity, levelAfter: null };
}

/** The price of the latest purchase that has one: the cost of a part taken from stock (D-38). */
export function lastUnitCostCents(movements: Movement[]): number | null {
  const purchases = movements
    .filter((movement) => movement.kind === "purchase" && movement.unitCostCents != null)
    .sort((a, b) => b.occurredAt - a.occurredAt || b.id - a.id);
  return purchases[0]?.unitCostCents ?? null;
}

/**
 * "Stock bas", a suggestion only (D-35): a part at or below its alert level; a product down to
 * its last container nearly empty, or none left (D-36); never a tool.
 */
export function isLowStock(item: { lowStockThreshold: number | null }, stock: ItemStock): boolean {
  switch (stock.kind) {
    case "part":
      return item.lowStockThreshold != null && stock.quantity <= item.lowStockThreshold;
    case "product":
      return (
        stock.containers === 0 ||
        (stock.containers === 1 && (stock.level === "low" || stock.level === "empty"))
      );
    case "tool":
      return false;
  }
}

/** What the workshop shows for an item: its restocking step, else "Stock bas" (D-35). */
export function rebuyState(
  item: { restockStatus: "none" | "to_order" | "ordered"; lowStockThreshold: number | null },
  stock: ItemStock,
): RebuyState | null {
  if (item.restockStatus !== "none") return item.restockStatus;
  return isLowStock(item, stock) ? "low_stock" : null;
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
