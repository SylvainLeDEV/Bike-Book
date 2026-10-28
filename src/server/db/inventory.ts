import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  ComponentTypeCode,
  InventoryCategory,
  InventoryKind,
  InventoryUnit,
  MovementKind,
  RestockStatus,
  ShopKind,
} from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import { stockQuantity } from "@/server/domain/inventory";
import type { AccessContext } from "./access-context";
import { getDb, type Tx } from "./client";
import {
  bikes,
  inventoryItemBikes,
  inventoryItems,
  inventoryMovements,
  maintenanceEvents,
  maintenanceItems,
  purchaseLinks,
  shops,
} from "./schema";
import { resolveShopId } from "./shops";

// The workshop of the workspace (feature 8, D-33 to D-42). Items carry the workspace; their
// bikes, links and movements are reached through them. Quantities are never stored (D-39).

export type InventoryMovement = {
  id: number;
  occurredAt: number;
  kind: MovementKind;
  quantityDelta: number;
  unitCostCents: number | null;
  purchaseLinkId: number | null;
  maintenanceItemId: number | null;
  /** For a use during maintenance: where and what. */
  maintenance: { bikeId: number; eventTitle: string; on: LocalDate } | null;
  note: string | null;
};

export type InventoryLink = {
  id: number;
  shop: { id: number; name: string; kind: ShopKind } | null;
  url: string | null;
  priceCents: number | null;
  priceNotedOn: LocalDate | null;
};

export type InventoryItem = {
  id: number;
  kind: InventoryKind;
  name: string;
  brand: string | null;
  reference: string | null;
  category: InventoryCategory;
  componentTypeCode: ComponentTypeCode | null;
  allBikes: boolean;
  bikeIds: number[];
  unit: InventoryUnit | null;
  lowStockThreshold: number | null;
  restockStatus: RestockStatus;
  restockQuantity: number | null;
  restockChangedOn: LocalDate | null;
  location: string | null;
  notes: string | null;
  archivedAt: number | null;
  /** Its photo (feature 10, D-75), changed through the attachments only. */
  photoAttachmentId: number | null;
  movements: InventoryMovement[];
  links: InventoryLink[];
};

export type ItemData = {
  name: string;
  brand: string | null;
  reference: string | null;
  category: InventoryCategory;
  componentTypeCode: ComponentTypeCode | null;
  allBikes: boolean;
  bikeIds: number[];
  unit: InventoryUnit;
  lowStockThreshold: number | null;
  location: string | null;
  notes: string | null;
};

type Outcome<T = object> = ({ ok: true } & T) | { ok: false; reason: "not_found" };

function ownedItem(tx: Tx, ctx: AccessContext, itemId: number) {
  return tx
    .select({
      id: inventoryItems.id,
      kind: inventoryItems.kind,
      archivedAt: inventoryItems.archivedAt,
      restockStatus: inventoryItems.restockStatus,
      restockQuantity: inventoryItems.restockQuantity,
      restockChangedOn: inventoryItems.restockChangedOn,
    })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.workspaceId, ctx.workspace.id)))
    .get();
}

/** The bike ids must all belong to the workspace. */
function ownsBikes(tx: Tx, ctx: AccessContext, bikeIds: number[]): boolean {
  if (!bikeIds.length) return true;
  const found = tx
    .select({ id: bikes.id })
    .from(bikes)
    .where(and(eq(bikes.workspaceId, ctx.workspace.id), inArray(bikes.id, bikeIds)))
    .all();
  return found.length === new Set(bikeIds).size;
}

function setBikes(tx: Tx, itemId: number, bikeIds: number[]) {
  tx.delete(inventoryItemBikes).where(eq(inventoryItemBikes.itemId, itemId)).run();
  for (const bikeId of new Set(bikeIds)) {
    tx.insert(inventoryItemBikes).values({ itemId, bikeId }).run();
  }
}

/** Every item of the workspace, archived ones included, with bikes, links and movements. */
export function listInventory(ctx: AccessContext): InventoryItem[] {
  const db = getDb();
  const items = db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.workspaceId, ctx.workspace.id))
    .orderBy(asc(inventoryItems.id))
    .all();
  if (!items.length) return [];
  const ids = items.map((item) => item.id);
  const itemBikes = db
    .select()
    .from(inventoryItemBikes)
    .where(inArray(inventoryItemBikes.itemId, ids))
    .all();
  const links = db
    .select({
      id: purchaseLinks.id,
      itemId: purchaseLinks.itemId,
      url: purchaseLinks.url,
      priceCents: purchaseLinks.priceCents,
      priceNotedOn: purchaseLinks.priceNotedOn,
      sortOrder: purchaseLinks.sortOrder,
      shopId: shops.id,
      shopName: shops.name,
      shopKind: shops.kind,
    })
    .from(purchaseLinks)
    .leftJoin(shops, eq(shops.id, purchaseLinks.shopId))
    .where(inArray(purchaseLinks.itemId, ids))
    .orderBy(asc(purchaseLinks.sortOrder), asc(purchaseLinks.id))
    .all();
  const movements = db
    .select({
      id: inventoryMovements.id,
      itemId: inventoryMovements.itemId,
      occurredAt: inventoryMovements.occurredAt,
      kind: inventoryMovements.kind,
      quantityDelta: inventoryMovements.quantityDelta,
      unitCostCents: inventoryMovements.unitCostCents,
      purchaseLinkId: inventoryMovements.purchaseLinkId,
      maintenanceItemId: inventoryMovements.maintenanceItemId,
      note: inventoryMovements.note,
      eventBikeId: maintenanceEvents.bikeId,
      eventTitle: maintenanceEvents.title,
      eventOn: maintenanceEvents.performedOn,
    })
    .from(inventoryMovements)
    .leftJoin(maintenanceItems, eq(maintenanceItems.id, inventoryMovements.maintenanceItemId))
    .leftJoin(maintenanceEvents, eq(maintenanceEvents.id, maintenanceItems.eventId))
    .where(inArray(inventoryMovements.itemId, ids))
    .orderBy(asc(inventoryMovements.occurredAt), asc(inventoryMovements.id))
    .all();

  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    name: item.name,
    brand: item.brand,
    reference: item.reference,
    category: item.category,
    componentTypeCode: item.componentTypeCode as ComponentTypeCode | null,
    allBikes: item.allBikes,
    bikeIds: itemBikes.filter((b) => b.itemId === item.id).map((b) => b.bikeId),
    unit: item.unit,
    lowStockThreshold: item.lowStockThreshold,
    restockStatus: item.restockStatus,
    restockQuantity: item.restockQuantity,
    restockChangedOn: item.restockChangedOn,
    location: item.location,
    notes: item.notes,
    archivedAt: item.archivedAt?.getTime() ?? null,
    photoAttachmentId: item.photoAttachmentId,
    links: links
      .filter((link) => link.itemId === item.id)
      .map((link) => ({
        id: link.id,
        shop:
          link.shopId != null && link.shopName != null && link.shopKind != null
            ? { id: link.shopId, name: link.shopName, kind: link.shopKind }
            : null,
        url: link.url,
        priceCents: link.priceCents,
        priceNotedOn: link.priceNotedOn,
      })),
    movements: movements
      .filter((movement) => movement.itemId === item.id)
      .map((movement) => ({
        id: movement.id,
        occurredAt: movement.occurredAt.getTime(),
        kind: movement.kind,
        quantityDelta: movement.quantityDelta,
        unitCostCents: movement.unitCostCents,
        purchaseLinkId: movement.purchaseLinkId,
        maintenanceItemId: movement.maintenanceItemId,
        maintenance:
          movement.eventBikeId != null && movement.eventTitle != null && movement.eventOn != null
            ? {
                bikeId: movement.eventBikeId,
                eventTitle: movement.eventTitle,
                on: movement.eventOn,
              }
            : null,
        note: movement.note,
      })),
  }));
}

/** A new part: the item, its bikes, its first stock (an `initial` movement) and a purchase link. */
export function createItem(
  ctx: AccessContext,
  data: ItemData & {
    initialQuantity: number;
    link: {
      shop: { name: string; kind: ShopKind } | null;
      url: string | null;
      priceCents: number | null;
    } | null;
    at: number;
    today: LocalDate;
  },
): Outcome<{ itemId: number }> {
  return getDb().transaction((tx) => {
    if (!ownsBikes(tx, ctx, data.bikeIds)) return { ok: false, reason: "not_found" };
    const { id } = tx
      .insert(inventoryItems)
      .values({
        workspaceId: ctx.workspace.id,
        kind: "part",
        name: data.name,
        brand: data.brand,
        reference: data.reference,
        category: data.category,
        componentTypeCode: data.componentTypeCode,
        allBikes: data.allBikes,
        unit: data.unit,
        lowStockThreshold: data.lowStockThreshold,
        location: data.location,
        notes: data.notes,
      })
      .returning({ id: inventoryItems.id })
      .get();
    if (!data.allBikes) setBikes(tx, id, data.bikeIds);
    if (data.initialQuantity > 0) {
      tx.insert(inventoryMovements)
        .values({
          itemId: id,
          occurredAt: new Date(data.at),
          kind: "initial",
          quantityDelta: data.initialQuantity,
          createdBy: ctx.user.id,
        })
        .run();
    }
    if (data.link && (data.link.shop || data.link.url)) {
      tx.insert(purchaseLinks)
        .values({
          itemId: id,
          shopId: resolveShopId(tx, ctx, data.link.shop),
          url: data.link.url,
          priceCents: data.link.priceCents,
          priceNotedOn: data.link.priceCents != null ? data.today : null,
        })
        .run();
    }
    return { ok: true, itemId: id };
  });
}

/** Changes an item's description (not its stock, links or restocking). */
export function updateItem(ctx: AccessContext, itemId: number, data: ItemData): Outcome {
  return getDb().transaction((tx) => {
    if (!ownedItem(tx, ctx, itemId) || !ownsBikes(tx, ctx, data.bikeIds)) {
      return { ok: false, reason: "not_found" };
    }
    const { bikeIds, ...fields } = data;
    tx.update(inventoryItems).set(fields).where(eq(inventoryItems.id, itemId)).run();
    setBikes(tx, itemId, data.allBikes ? [] : bikeIds);
    return { ok: true };
  });
}

/** Archives an item (or brings it back); never deleted, past parts keep their link. */
export function setItemArchived(
  ctx: AccessContext,
  itemId: number,
  archivedAt: number | null,
): Outcome {
  return getDb().transaction((tx) => {
    if (!ownedItem(tx, ctx, itemId)) return { ok: false, reason: "not_found" };
    tx.update(inventoryItems)
      .set({ archivedAt: archivedAt == null ? null : new Date(archivedAt) })
      .where(eq(inventoryItems.id, itemId))
      .run();
    return { ok: true };
  });
}

/** Records a stock movement by hand: "−" a use, "+" a purchase, or a correction after a count. */
export function addMovement(
  ctx: AccessContext,
  itemId: number,
  movement: {
    kind: "purchase" | "use" | "adjustment";
    quantityDelta: number;
    unitCostCents: number | null;
    note: string | null;
    at: number;
  },
): Outcome<{ movementId: number }> {
  return getDb().transaction((tx) => {
    if (!ownedItem(tx, ctx, itemId)) return { ok: false, reason: "not_found" };
    const { id } = tx
      .insert(inventoryMovements)
      .values({
        itemId,
        occurredAt: new Date(movement.at),
        kind: movement.kind,
        quantityDelta: movement.quantityDelta,
        unitCostCents: movement.unitCostCents,
        note: movement.note,
        createdBy: ctx.user.id,
      })
      .returning({ id: inventoryMovements.id })
      .get();
    return { ok: true, movementId: id };
  });
}

/** Undoes a movement recorded by hand (D-60); a replacement's movement goes with the replacement. */
export function undoMovement(ctx: AccessContext, movementId: number): Outcome {
  return getDb().transaction((tx) => {
    const movement = tx
      .select({
        id: inventoryMovements.id,
        maintenanceItemId: inventoryMovements.maintenanceItemId,
      })
      .from(inventoryMovements)
      .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryMovements.itemId))
      .where(
        and(
          eq(inventoryMovements.id, movementId),
          eq(inventoryItems.workspaceId, ctx.workspace.id),
        ),
      )
      .get();
    if (!movement || movement.maintenanceItemId != null) return { ok: false, reason: "not_found" };
    tx.delete(inventoryMovements).where(eq(inventoryMovements.id, movementId)).run();
    return { ok: true };
  });
}

export type RestockFields = {
  status: RestockStatus;
  quantity: number | null;
  changedOn: LocalDate | null;
};

/**
 * Moves an item along its restocking steps: to order, ordered, back to none; "received" goes
 * through `receiveItem`. Returns the previous step, for "Annuler" (D-60).
 */
export function setRestock(
  ctx: AccessContext,
  itemId: number,
  next: RestockFields,
): Outcome<{ previous: RestockFields }> {
  return getDb().transaction((tx) => {
    const item = ownedItem(tx, ctx, itemId);
    if (!item) return { ok: false, reason: "not_found" };
    tx.update(inventoryItems)
      .set({
        restockStatus: next.status,
        restockQuantity: next.status === "none" ? null : next.quantity,
        restockChangedOn: next.status === "none" ? null : next.changedOn,
      })
      .where(eq(inventoryItems.id, itemId))
      .run();
    return {
      ok: true,
      previous: {
        status: item.restockStatus,
        quantity: item.restockQuantity,
        changedOn: item.restockChangedOn,
      },
    };
  });
}

/**
 * "Reçu" (D-42): a purchase movement of the quantity received, at the price of the cheapest link
 * when known, and the restocking back to none, in one transaction.
 */
export function receiveItem(
  ctx: AccessContext,
  itemId: number,
  input: {
    quantity: number;
    unitCostCents: number | null;
    purchaseLinkId: number | null;
    at: number;
  },
): Outcome<{ movementId: number; previous: RestockFields }> {
  return getDb().transaction((tx) => {
    const item = ownedItem(tx, ctx, itemId);
    if (!item) return { ok: false, reason: "not_found" };
    const { id } = tx
      .insert(inventoryMovements)
      .values({
        itemId,
        occurredAt: new Date(input.at),
        kind: "purchase",
        quantityDelta: input.quantity,
        unitCostCents: input.unitCostCents,
        purchaseLinkId: input.purchaseLinkId,
        createdBy: ctx.user.id,
      })
      .returning({ id: inventoryMovements.id })
      .get();
    tx.update(inventoryItems)
      .set({ restockStatus: "none", restockQuantity: null, restockChangedOn: null })
      .where(eq(inventoryItems.id, itemId))
      .run();
    return {
      ok: true,
      movementId: id,
      previous: {
        status: item.restockStatus,
        quantity: item.restockQuantity,
        changedOn: item.restockChangedOn,
      },
    };
  });
}

/** "Annuler" after "Reçu": deletes the purchase and puts the restocking step back. */
export function undoReceive(
  ctx: AccessContext,
  itemId: number,
  movementId: number,
  previous: RestockFields,
): Outcome {
  return getDb().transaction((tx) => {
    if (!ownedItem(tx, ctx, itemId)) return { ok: false, reason: "not_found" };
    const movement = tx
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.id, movementId), eq(inventoryMovements.itemId, itemId)))
      .get();
    if (!movement) return { ok: false, reason: "not_found" };
    tx.delete(inventoryMovements).where(eq(inventoryMovements.id, movementId)).run();
    tx.update(inventoryItems)
      .set({
        restockStatus: previous.status,
        restockQuantity: previous.status === "none" ? null : previous.quantity,
        restockChangedOn: previous.status === "none" ? null : previous.changedOn,
      })
      .where(eq(inventoryItems.id, itemId))
      .run();
    return { ok: true };
  });
}

/** Adds a purchase link (a shop, a page, a price typed by hand; never fetched, D-09). */
export function addPurchaseLink(
  ctx: AccessContext,
  itemId: number,
  link: {
    shop: { name: string; kind: ShopKind } | null;
    url: string | null;
    priceCents: number | null;
    notedOn: LocalDate;
  },
): Outcome<{ linkId: number }> {
  return getDb().transaction((tx) => {
    if (!ownedItem(tx, ctx, itemId)) return { ok: false, reason: "not_found" };
    const count = tx
      .select({ id: purchaseLinks.id })
      .from(purchaseLinks)
      .where(eq(purchaseLinks.itemId, itemId))
      .all().length;
    const { id } = tx
      .insert(purchaseLinks)
      .values({
        itemId,
        shopId: resolveShopId(tx, ctx, link.shop),
        url: link.url,
        priceCents: link.priceCents,
        priceNotedOn: link.priceCents != null ? link.notedOn : null,
        sortOrder: count,
      })
      .returning({ id: purchaseLinks.id })
      .get();
    return { ok: true, linkId: id };
  });
}

/** Inside a replacement's transaction: the stock of a part item, and that it is usable. */
export function stockForReplacement(
  tx: Tx,
  ctx: AccessContext,
  itemId: number,
): { quantity: number } | null {
  const item = ownedItem(tx, ctx, itemId);
  if (!item || item.kind !== "part" || item.archivedAt != null) return null;
  const movements = tx
    .select({ quantityDelta: inventoryMovements.quantityDelta })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.itemId, itemId))
    .all();
  return { quantity: stockQuantity(movements) };
}
