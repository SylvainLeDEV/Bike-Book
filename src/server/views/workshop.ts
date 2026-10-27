import "server-only";
import { localDateOf, startOfLocalDay } from "@/lib/format";
import type {
  BikeRef,
  InventoryItemVM,
  InventoryRowVM,
  MovementVM,
  PurchaseLinkVM,
  RebuyRowVM,
  RuleRowVM,
} from "@/lib/view-models";
import {
  listBikes,
  listComponents,
  listComponentTypes,
  listInventory,
  listRides,
  listRuleResets,
  listRules,
  type AccessContext,
  type Bike,
  type InventoryItem,
  type Ride,
} from "@/server/db";
import { canBeRidden } from "@/server/domain/bikes";
import {
  lastUnitCostCents,
  rebuyOrder,
  rebuyState,
  servesBike,
  stockQuantity,
  type RuleNeed,
} from "@/server/domain/inventory";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { bikeRef } from "./refs";
import { evaluateBikeRules, type EvaluatedRule } from "./rules";

// The garage as a whole: every ridable bike with its evaluated rules, and the workshop's parts
// with their computed stock (D-39), restocking state (D-35) and the rules they serve. Shared by
// the dashboard, the bike page and the workshop, so the three always agree.

export type Garage = {
  bikes: Bike[];
  ridable: Bike[];
  rides: Map<number, Ride[]>;
  rules: Map<number, EvaluatedRule[]>;
  items: InventoryItemVM[];
};

export function loadGarage(ctx: AccessContext): Garage {
  const { timeZone } = getEnv();
  const day = today();
  const now = Date.now();
  const bikes = listBikes(ctx);
  const ridable = bikes.filter((bike) => canBeRidden(bike.status));
  const types = listComponentTypes();
  const rides = new Map<number, Ride[]>();
  const rules = new Map<number, EvaluatedRule[]>();
  for (const bike of ridable) {
    const bikeRides = listRides(ctx, { bikeId: bike.id });
    rides.set(bike.id, bikeRides);
    const trackedSince = bike.purchasedOn ?? localDateOf(bike.createdAt.getTime(), timeZone);
    rules.set(
      bike.id,
      evaluateBikeRules({
        bike: {
          id: bike.id,
          name: bike.name,
          trackingStartAt: startOfLocalDay(trackedSince, timeZone),
        },
        rules: listRules(ctx, bike.id),
        resets: listRuleResets(ctx, bike.id),
        components: listComponents(ctx, bike.id),
        types,
        rides: bikeRides,
        now,
        today: day,
        timeZone,
      }),
    );
  }
  const items = listInventory(ctx)
    .filter((item) => item.kind === "part" && item.archivedAt == null)
    .map((item) => itemVM(item, bikes, ridable, rules, timeZone));
  // A rule row shows the workshop part that serves its slot (the sealant's "vide · à commander").
  for (const [bikeId, evaluated] of rules) {
    for (const entry of evaluated) {
      entry.row.stock = stockLine(entry.rule.componentTypeCode, bikeId, items);
    }
  }
  return { bikes, ridable, rides, rules, items };
}

function cheapest(links: PurchaseLinkVM[]) {
  return links
    .filter((link) => link.priceCents != null)
    .reduce<PurchaseLinkVM | null>(
      (best, link) => (!best || link.priceCents! < best.priceCents! ? link : best),
      null,
    );
}

function urlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "Lien";
  }
}

function itemVM(
  item: InventoryItem,
  bikes: Bike[],
  ridable: Bike[],
  rules: Map<number, EvaluatedRule[]>,
  timeZone: string,
): InventoryItemVM {
  const quantity = stockQuantity(item.movements);
  const refs = new Map(bikes.map((bike) => [bike.id, bikeRef(bike)]));
  const links: PurchaseLinkVM[] = item.links.map((link) => {
    const lastPurchase = [...item.movements]
      .reverse()
      .find((movement) => movement.kind === "purchase" && movement.purchaseLinkId === link.id);
    return {
      id: link.id,
      shopName: link.shop?.name ?? (link.url ? urlHost(link.url) : "Boutique"),
      shopKind: link.shop?.kind ?? (link.url ? "online" : "physical"),
      url: link.url,
      priceCents: link.priceCents,
      lastPurchasedOn: lastPurchase ? localDateOf(lastPurchase.occurredAt, timeZone) : null,
      priceNotedOn: link.priceNotedOn,
    };
  });
  const served = ridable.filter((bike) => servesBike(item, bike.id));
  const rulesServed = item.componentTypeCode
    ? served.flatMap((bike) =>
        (rules.get(bike.id) ?? [])
          .filter((entry) => entry.rule.componentTypeCode === item.componentTypeCode)
          .map(({ row }) => ({
            ruleId: row.id,
            bike: refs.get(bike.id)!,
            title: row.title,
            status: row.status,
            used: row.used,
            interval: row.interval,
            dueOn: row.dueOn,
          })),
      )
    : [];
  const lastUse = [...item.movements]
    .reverse()
    .find((movement) => movement.kind === "use" && movement.maintenance);
  const movements: MovementVM[] = [...item.movements].reverse().map((movement) => {
    const link = item.links.find((l) => l.id === movement.purchaseLinkId);
    const bikeName = movement.maintenance
      ? (bikes.find((b) => b.id === movement.maintenance!.bikeId)?.name ?? null)
      : null;
    return {
      id: movement.id,
      kind: movement.kind,
      quantityDelta: movement.quantityDelta,
      occurredOn: localDateOf(movement.occurredAt, timeZone),
      source:
        movement.kind === "purchase"
          ? (link?.shop?.name ?? (link?.url ? urlHost(link.url) : null))
          : bikeName,
      detail: movement.note,
      maintenance: movement.maintenance
        ? { bikeId: movement.maintenance.bikeId, title: movement.maintenance.eventTitle }
        : null,
    };
  });
  const best = cheapest(links);
  return {
    id: item.id,
    kind: "part",
    name: item.name,
    brand: item.brand,
    reference: item.reference,
    category: item.category,
    componentTypeCode: item.componentTypeCode,
    bikes: item.allBikes
      ? "all"
      : item.bikeIds.flatMap((id) => (refs.has(id) ? [refs.get(id) as BikeRef] : [])),
    location: item.location,
    quantity,
    unit: item.unit ?? "piece",
    state: rebuyState(item, quantity),
    lowStockThreshold: item.lowStockThreshold,
    lastUnitCostCents: lastUnitCostCents(item.movements),
    restock: {
      status: item.restockStatus,
      quantity: item.restockQuantity,
      changedOn: item.restockChangedOn,
      orderedOn: item.restockStatus === "ordered" ? item.restockChangedOn : null,
      shopName: best?.shopName ?? links[0]?.shopName ?? null,
    },
    purchaseLinks: links,
    rulesServed,
    lastUse:
      lastUse?.maintenance != null
        ? {
            on: lastUse.maintenance.on,
            bikeName: bikes.find((b) => b.id === lastUse.maintenance!.bikeId)?.name ?? "",
            title: lastUse.maintenance.eventTitle,
          }
        : null,
    movements,
    notes: item.notes,
  };
}

/** The workshop part a rule's slot uses on that bike: one to rebuy first, else the first one. */
export function stockLine(
  typeCode: string | null,
  bikeId: number,
  items: InventoryItemVM[],
): RuleRowVM["stock"] {
  if (!typeCode) return null;
  const fitting = items.filter(
    (item) =>
      item.componentTypeCode === typeCode &&
      (item.bikes === "all" || item.bikes.some((bike) => bike.id === bikeId)),
  );
  const item = fitting.find((i) => i.state != null) ?? fitting[0];
  return item
    ? {
        itemId: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        state: item.state,
      }
    : null;
}

/** What "À racheter" needs from the rules: the worst late or due-soon rule an item serves. */
function needOf(item: InventoryItemVM): RuleNeed | null {
  const urgent = item.rulesServed.filter((r) => r.status === "overdue" || r.status === "due_soon");
  const worst = urgent.find((r) => r.status === "overdue") ?? urgent[0];
  return worst ? { status: worst.status as RuleNeed["status"], dueOn: worst.dueOn } : null;
}

/** "À racheter", most urgent first (D-41). */
export function rebuyRows(items: InventoryItemVM[]): RebuyRowVM[] {
  return rebuyOrder(items.map((item) => ({ ...item, need: needOf(item) }))).map((item) => {
    const price = cheapest(item.purchaseLinks)?.priceCents ?? null;
    return {
      itemId: item.id,
      name: item.name,
      bikes: item.bikes,
      state: item.state!,
      reason: item.need
        ? { kind: "rule", status: item.need.status, neededOn: item.need.dueOn }
        : item.state === "ordered"
          ? {
              kind: "ordered",
              orderedOn: item.restock.orderedOn ?? item.restock.changedOn ?? "",
              priceCents: price,
            }
          : item.state === "low_stock"
            ? { kind: "low_stock", quantity: item.quantity, unit: item.unit }
            : { kind: "price", priceCents: price },
    };
  });
}

/** "En stock pour ce vélo": the parts that serve it, those to rebuy first. */
export function bikeStock(items: InventoryItemVM[], bikeId: number) {
  const rows: InventoryRowVM[] = items
    .filter((item) => item.bikes === "all" || item.bikes.some((bike) => bike.id === bikeId))
    .sort(
      (a, b) =>
        Number(b.state != null) - Number(a.state != null) || a.name.localeCompare(b.name, "fr"),
    )
    .map(({ id, name, category, bikes, location, quantity, unit, state }) => ({
      id,
      name,
      category,
      bikes,
      location,
      quantity,
      unit,
      state,
    }));
  return { rows, total: rows.length, toRebuy: rows.filter((row) => row.state != null).length };
}
