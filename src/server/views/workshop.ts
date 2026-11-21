import "server-only";
import { containerWords } from "@/lib/display";
import { localDateOf, startOfLocalDay } from "@/lib/format";
import { photoFrame } from "@/lib/framing";
import { INVENTORY_CATEGORY_LABELS } from "@/lib/labels";
import type {
  BikeRef,
  HistoryItemVM,
  InventoryItemVM,
  InventoryRowVM,
  ItemStockVM,
  MovementVM,
  PartItemVM,
  ProductLevel,
  PurchaseLinkVM,
  RebuyRowVM,
  RuleRowVM,
  WorkshopHistoryEntryVM,
  WorkshopHistoryVM,
} from "@/lib/view-models";
import { historyGroupOf } from "@/lib/workshop-history";
import {
  listBikes,
  listComponents,
  listComponentTypes,
  listInventory,
  listProcedures,
  listRides,
  listRunsInProgress,
  listRuleResets,
  listRules,
  type AccessContext,
  type Bike,
  type InventoryItem,
  type Procedure,
  type Ride,
  type RunInProgress,
} from "@/server/db";
import { canBeRidden, trackingStartOn } from "@/server/domain/bikes";
import {
  itemStock,
  lastUnitCostCents,
  productStock,
  rebuyOrder,
  rebuyState,
  servesBike,
  type ItemStock,
  type RuleNeed,
} from "@/server/domain/inventory";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { procedureRefOf } from "./procedures";
import { bikeRef } from "./refs";
import { evaluateBikeRules, type EvaluatedRule } from "./rules";

// The garage as a whole: every ridable bike with its evaluated rules, and the workshop's parts,
// products and tools (D-85) with their computed stock (D-39), restocking state (D-35) and the
// rules they serve. Shared by the dashboard, the bike page and the workshop, so the three always
// agree.

export type Garage = {
  bikes: Bike[];
  ridable: Bike[];
  rides: Map<number, Ride[]>;
  rules: Map<number, EvaluatedRule[]>;
  items: InventoryItemVM[];
  /** Archived ones included (D-86). */
  procedures: Procedure[];
  /** Runs in progress (D-87): "En cours" in "À prévoir". */
  runs: RunInProgress[];
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
    const trackedSince = trackingStartOn(bike, timeZone);
    rules.set(
      bike.id,
      evaluateBikeRules({
        bike: {
          id: bike.id,
          name: bike.name,
          trackingStartAt: startOfLocalDay(trackedSince, timeZone),
          coverAttachmentId: bike.coverAttachmentId,
          coverPhoto: bike.coverPhoto,
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
    .filter((item) => item.archivedAt == null)
    .map((item) => itemVM(item, bikes, ridable, rules, timeZone));
  const procedures = listProcedures(ctx);
  const runs = listRunsInProgress(ctx);
  // A rule row shows the workshop part that serves its slot (the sealant's "vide · à commander")
  // and the procedure it is done with (D-86).
  for (const [bikeId, evaluated] of rules) {
    for (const entry of evaluated) {
      entry.row.stock = stockLine(entry.rule.componentTypeCode, bikeId, items);
      entry.row.procedure = procedureRefOf(entry.rule.procedureId, procedures);
      entry.row.run = runOf(runs, entry.rule.id);
    }
  }
  return { bikes, ridable, rides, rules, items, procedures, runs };
}

/**
 * The archived items, built as the others but serving no rule: the app lists none of them, the
 * MCP's list_workshop_items does on request (D-100).
 */
export function archivedItems(ctx: AccessContext, garage: Garage): InventoryItemVM[] {
  const { timeZone } = getEnv();
  return listInventory(ctx)
    .filter((item) => item.archivedAt != null)
    .map((item) => itemVM(item, garage.bikes, garage.ridable, new Map(), timeZone));
}

/** "En cours" on a rule: its run in progress (D-87). */
export function runOf(runs: RunInProgress[], ruleId: number): RuleRowVM["run"] {
  const run = runs.find((r) => r.ruleId === ruleId);
  return run ? { id: run.id, status: run.status } : null;
}

/** What an item holds, with the words to say it: its unit, its container (D-85). */
export function stockVM(
  item: Pick<InventoryItem, "unit" | "containerLabel">,
  stock: ItemStock,
): ItemStockVM {
  switch (stock.kind) {
    case "part":
      return { ...stock, unit: item.unit ?? "piece" };
    case "product":
      return { ...stock, container: containerWords(item.containerLabel) };
    case "tool":
      return stock;
  }
}

/** Only the stock of a row: what a rule's line and "À racheter" carry. */
export function pickStock(item: ItemStockVM): ItemStockVM {
  switch (item.kind) {
    case "part":
      return { kind: item.kind, quantity: item.quantity, unit: item.unit };
    case "product":
      return {
        kind: item.kind,
        containers: item.containers,
        level: item.level,
        container: item.container,
      };
    case "tool":
      return { kind: item.kind, owned: item.owned };
  }
}

/** The parts of the workshop: what "Remplacer une pièce" offers. */
export function isPartItem(item: InventoryItemVM): item is PartItemVM {
  return item.kind === "part";
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
  const stock = itemStock(item.kind, item.movements);
  const refs = new Map(bikes.map((bike) => [bike.id, bikeRef(bike)]));
  const links: PurchaseLinkVM[] = item.links.map((link) => {
    const lastPurchase = [...item.movements]
      .reverse()
      .find((movement) => movement.kind === "purchase" && movement.purchaseLinkId === link.id);
    return {
      id: link.id,
      shopName: link.shop?.name ?? (link.url ? urlHost(link.url) : "Boutique"),
      shop: link.shop?.name ?? null,
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
  // A product's level before each movement, in recording order as its stock reads it (D-111).
  const levelsBefore = new Map<number, ProductLevel>();
  if (item.kind === "product") {
    const recorded = [...item.movements].sort((a, b) => a.id - b.id);
    recorded.forEach((movement, index) =>
      levelsBefore.set(movement.id, productStock(recorded.slice(0, index)).level),
    );
  }
  const shopOf = (linkId: number | null) => {
    const link = item.links.find((l) => l.id === linkId);
    return link ? (link.shop?.name ?? (link.url ? urlHost(link.url) : null)) : null;
  };
  const movements: MovementVM[] = [...item.movements].reverse().map((movement) => {
    const bikeName = movement.maintenance
      ? (bikes.find((b) => b.id === movement.maintenance!.bikeId)?.name ?? null)
      : null;
    return {
      id: movement.id,
      kind: movement.kind,
      quantityDelta: movement.quantityDelta,
      occurredOn: localDateOf(movement.occurredAt, timeZone),
      source: movement.kind === "purchase" ? shopOf(movement.purchaseLinkId) : bikeName,
      detail: movement.note,
      maintenance: movement.maintenance
        ? {
            bikeId: movement.maintenance.bikeId,
            eventId: movement.maintenance.eventId,
            title: movement.maintenance.eventTitle,
          }
        : null,
      levelAfter: movement.levelAfter,
      levelBefore: levelsBefore.get(movement.id) ?? null,
      unitCostCents: movement.unitCostCents,
      purchaseLinkId: movement.purchaseLinkId,
    };
  });
  // The latest purchase by its day (D-111), as "Dernier achat" says it.
  const lastPurchase = [...item.movements].reverse().find((m) => m.kind === "purchase");
  const best = cheapest(links);
  return {
    id: item.id,
    ...stockVM(item, stock),
    name: item.name,
    photoUrl:
      item.photoAttachmentId == null ? null : `/api/uploads/${item.photoAttachmentId}?size=thumb`,
    photoFrame: item.photoAttachmentId == null ? null : photoFrame(item.photo),
    brand: item.brand,
    reference: item.reference,
    category: item.category,
    componentTypeCode: item.componentTypeCode,
    bikes: item.allBikes
      ? "all"
      : item.bikeIds.flatMap((id) => (refs.has(id) ? [refs.get(id) as BikeRef] : [])),
    location: item.location,
    state: rebuyState(item, stock),
    lowStockThreshold: item.lowStockThreshold,
    containerLabel: item.containerLabel,
    lastUnitCostCents: lastUnitCostCents(item.movements),
    lastPurchase: lastPurchase
      ? {
          on: localDateOf(lastPurchase.occurredAt, timeZone),
          unitCostCents: lastPurchase.unitCostCents,
          shopName: shopOf(lastPurchase.purchaseLinkId),
        }
      : null,
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

/**
 * The workshop's history (D-111): every movement of the items, archived ones included, newest
 * first (by day, then in recording order), each with its item's kind and group; the items with
 * what the history needs of them (search, bike filter, words, links for the movement sheet).
 */
export function workshopHistory(
  items: InventoryItemVM[],
  archived: InventoryItemVM[],
): WorkshopHistoryVM {
  const archivedIds = new Set(archived.map((item) => item.id));
  const all = [...items, ...archived];
  return {
    items: all.map((item): HistoryItemVM => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      category: item.category,
      archived: archivedIds.has(item.id),
      bikes: item.bikes === "all" ? "all" : item.bikes.map((bike) => bike.id),
      searchText: [
        item.brand,
        item.reference,
        INVENTORY_CATEGORY_LABELS[item.category],
        item.location,
      ]
        .filter(Boolean)
        .join(" "),
      unit: item.kind === "part" ? item.unit : null,
      container: item.kind === "product" ? item.container : null,
      links: item.purchaseLinks.map((link) => ({
        id: link.id,
        shopName: link.shopName,
        priceCents: link.priceCents,
      })),
    })),
    entries: all
      .flatMap((item) =>
        item.movements.map((movement): WorkshopHistoryEntryVM => ({
          ...movement,
          itemId: item.id,
          itemKind: item.kind,
          on: movement.occurredOn,
          group: historyGroupOf(movement.kind),
        })),
      )
      .sort((a, b) => b.on.localeCompare(a.on) || b.id - a.id),
  };
}

/**
 * What a rule's slot uses on that bike (D-85): a part, else a product, one to rebuy first; never
 * a tool (tools show in "À racheter" and on their own page).
 */
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
  const parts = fitting.filter((item) => item.kind === "part");
  const pool = parts.length ? parts : fitting.filter((item) => item.kind === "product");
  const item = pool.find((i) => i.state != null) ?? pool[0];
  return item ? { itemId: item.id, name: item.name, state: item.state, ...pickStock(item) } : null;
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
      itemKind: item.kind,
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
            ? { kind: "low_stock", stock: pickStock(item) }
            : { kind: "price", priceCents: price },
    };
  });
}

/**
 * "En stock pour ce vélo": the parts and products that serve it, those to rebuy first, parts
 * before products. Tools are not listed but count among the items to rebuy (D-85).
 */
export function bikeStock(items: InventoryItemVM[], bikeId: number) {
  const serving = items.filter(
    (item) => item.bikes === "all" || item.bikes.some((bike) => bike.id === bikeId),
  );
  const rows: InventoryRowVM[] = serving
    .filter((item) => item.kind !== "tool")
    .sort(
      (a, b) =>
        Number(b.state != null) - Number(a.state != null) ||
        Number(a.kind === "product") - Number(b.kind === "product") ||
        a.name.localeCompare(b.name, "fr"),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      photoUrl: item.photoUrl,
      photoFrame: item.photoFrame,
      category: item.category,
      bikes: item.bikes,
      location: item.location,
      state: item.state,
      ...pickStock(item),
    }));
  return {
    rows,
    total: serving.length,
    toRebuy: serving.filter((item) => item.state != null).length,
  };
}
