import "server-only";
import { and, asc, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import type {
  ComponentOrigin,
  ComponentPosition,
  ComponentTypeCode,
  MaintenanceAction,
  MaintenancePerformer,
  MeasurementUnit,
  RemovalReason,
  ShopKind,
} from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import { occupiedSlot, replacementOrigin } from "@/server/domain/components";
import type { AccessContext } from "./access-context";
import { getDb, type Tx } from "./client";
import {
  bikes,
  components,
  inventoryMovements,
  componentTypes,
  maintenanceEvents,
  maintenanceItems,
  shops,
} from "./schema";
import { stockForReplacement } from "./inventory";
import { insertRulesFromTemplates } from "./rules";
import { resolveShopId } from "./shops";

// Components and maintenance of the workspace's bikes. Both inherit the workspace through
// `bike_id` (D-25): every function first checks that the bike belongs to ctx.workspace.

export type Component = {
  id: number;
  bikeId: number;
  typeCode: ComponentTypeCode;
  position: ComponentPosition;
  brand: string | null;
  model: string | null;
  reference: string | null;
  specs: Record<string, string | number> | null;
  origin: ComponentOrigin;
  replacesComponentId: number | null;
  installedAt: number;
  initialDistanceM: number;
  initialWearS: number;
  removedAt: number | null;
  removalReason: RemovalReason | null;
  removalNote: string | null;
  purchasedOn: LocalDate | null;
  purchasePriceCents: number | null;
  shop: { id: number; name: string; kind: ShopKind } | null;
  warrantyEndsOn: LocalDate | null;
  notes: string | null;
};

/** What adding or editing a part writes (type and position cannot change once created). */
export type ComponentData = {
  brand: string | null;
  model: string | null;
  reference: string | null;
  /** Free key/values (`travel_mm`…); left unchanged when undefined. */
  specs?: Record<string, string | number> | null;
  origin: "stock" | "upgrade";
  installedAt: number;
  initialDistanceM: number;
  initialWearS: number;
  purchasedOn: LocalDate | null;
  purchasePriceCents: number | null;
  shop: { name: string; kind: ShopKind } | null;
  warrantyEndsOn: LocalDate | null;
  notes: string | null;
};

export type SaveComponentOutcome =
  | { ok: true; componentId: number }
  | { ok: false; reason: "not_found" | "invalid_position" | "after_removal" }
  | { ok: false; reason: "slot_taken"; takenBy: string };

/** True when the bike belongs to the workspace. */
function ownsBike(tx: Tx, ctx: AccessContext, bikeId: number): boolean {
  return (
    tx
      .select({ id: bikes.id })
      .from(bikes)
      .where(and(eq(bikes.id, bikeId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get() != null
  );
}

const componentColumns = {
  id: components.id,
  bikeId: components.bikeId,
  typeCode: components.typeCode,
  position: components.position,
  brand: components.brand,
  model: components.model,
  reference: components.reference,
  specs: components.specs,
  origin: components.origin,
  replacesComponentId: components.replacesComponentId,
  installedAt: components.installedAt,
  initialDistanceM: components.initialDistanceM,
  initialWearS: components.initialWearS,
  removedAt: components.removedAt,
  removalReason: components.removalReason,
  removalNote: components.removalNote,
  purchasedOn: components.purchasedOn,
  purchasePriceCents: components.purchasePriceCents,
  warrantyEndsOn: components.warrantyEndsOn,
  notes: components.notes,
  shopId: shops.id,
  shopName: shops.name,
  shopKind: shops.kind,
};

/** Parts of the workspace's bikes matching `condition`, with their shop. */
function selectComponents(db: Tx | ReturnType<typeof getDb>, ctx: AccessContext, condition: SQL) {
  return db
    .select(componentColumns)
    .from(components)
    .innerJoin(bikes, eq(bikes.id, components.bikeId))
    .leftJoin(shops, eq(shops.id, components.shopId))
    .where(and(eq(bikes.workspaceId, ctx.workspace.id), condition));
}

type ComponentRow = Awaited<ReturnType<ReturnType<typeof selectComponents>["all"]>>[number];

function toComponent({ shopId, shopName, shopKind, ...row }: ComponentRow): Component {
  return {
    ...row,
    typeCode: row.typeCode as ComponentTypeCode,
    installedAt: row.installedAt.getTime(),
    removedAt: row.removedAt?.getTime() ?? null,
    shop:
      shopId != null && shopName != null && shopKind != null
        ? { id: shopId, name: shopName, kind: shopKind }
        : null,
  };
}

/** Every part of a bike of the workspace, fitted or removed, in the order they were added. */
export function listComponents(ctx: AccessContext, bikeId: number): Component[] {
  return selectComponents(getDb(), ctx, eq(components.bikeId, bikeId))
    .orderBy(asc(components.id))
    .all()
    .map(toComponent);
}

/** One part of a bike of the workspace, or null. */
export function getComponent(ctx: AccessContext, componentId: number): Component | null {
  const row = selectComponents(getDb(), ctx, eq(components.id, componentId)).get();
  return row ? toComponent(row) : null;
}

function nameOf(row: { brand: string | null; model: string | null }) {
  return [row.brand, row.model].filter(Boolean).join(" ") || "une pièce";
}

/** Adds a part to a bike of the workspace. One fitted part per single slot (docs/03). */
export function createComponent(
  ctx: AccessContext,
  bikeId: number,
  slot: { typeCode: ComponentTypeCode; position: ComponentPosition },
  data: ComponentData,
  /** Rule templates to copy for this slot (feature 6). */
  templateIds: number[] = [],
): SaveComponentOutcome {
  return getDb().transaction((tx) => {
    if (!ownsBike(tx, ctx, bikeId)) return { ok: false, reason: "not_found" };
    const type = tx
      .select()
      .from(componentTypes)
      .where(eq(componentTypes.code, slot.typeCode))
      .get();
    if (!type) return { ok: false, reason: "not_found" };
    if (type.hasPosition !== (slot.position !== "none")) {
      return { ok: false, reason: "invalid_position" };
    }
    const fitted = tx
      .select({
        id: components.id,
        typeCode: components.typeCode,
        position: components.position,
        removedAt: components.removedAt,
        brand: components.brand,
        model: components.model,
      })
      .from(components)
      .where(and(eq(components.bikeId, bikeId), eq(components.typeCode, slot.typeCode)))
      .all()
      .map((row) => ({
        ...row,
        typeCode: row.typeCode as ComponentTypeCode,
        removedAt: row.removedAt?.getTime() ?? null,
      }));
    const taken = occupiedSlot(fitted, { ...slot, singleSlot: type.singleSlot });
    if (taken) return { ok: false, reason: "slot_taken", takenBy: nameOf(taken) };

    const { shop, installedAt, ...fields } = data;
    const { id } = tx
      .insert(components)
      .values({
        ...fields,
        ...slot,
        bikeId,
        installedAt: new Date(installedAt),
        shopId: resolveShopId(tx, ctx, shop),
      })
      .returning({ id: components.id })
      .get();
    insertRulesFromTemplates(tx, ctx, {
      bikeId,
      typeCode: slot.typeCode,
      position: slot.position,
      templateIds,
      counterStartAt: installedAt,
    });
    return { ok: true, componentId: id };
  });
}

/**
 * Changes a part of the workspace (not its type, position or removal). A part fitted by a
 * replacement keeps its origin and fitting instant: they belong to the replacement.
 */
export function updateComponent(
  ctx: AccessContext,
  componentId: number,
  data: ComponentData,
): SaveComponentOutcome {
  return getDb().transaction((tx) => {
    const current = selectComponents(tx, ctx, eq(components.id, componentId)).get();
    if (!current) return { ok: false, reason: "not_found" };
    const fromReplacement = current.replacesComponentId != null;
    const { shop, origin, installedAt: requested, ...fields } = data;
    const installedAt = fromReplacement ? current.installedAt.getTime() : requested;
    if (current.removedAt && installedAt > current.removedAt.getTime()) {
      return { ok: false, reason: "after_removal" };
    }
    tx.update(components)
      .set({
        ...fields,
        origin: fromReplacement ? current.origin : origin,
        installedAt: new Date(installedAt),
        shopId: resolveShopId(tx, ctx, shop),
      })
      .where(eq(components.id, componentId))
      .run();
    return { ok: true, componentId };
  });
}

// --- Replacement (docs/03, "Replace a part" flow) -------------------------------------------------

export type ReplacementData = {
  removedComponentId: number;
  /** The day it was done (the maintenance event's date). */
  on: LocalDate;
  /** When it was recorded: the event's `created_at`. */
  recordedAt: number;
  /** When the swap happened, for the counters: eventInstant(on, recordedAt) (D-61). */
  at: number;
  reason: RemovalReason;
  removalNote: string | null;
  newPart: {
    brand: string | null;
    model: string;
    reference?: string | null;
    priceCents: number | null;
  };
  /** A workshop part taken from stock: −1 in the same transaction (D-33, D-38). */
  fromItemId?: number | null;
  /** The event's title, written by the caller: "Chaîne remplacée". */
  eventTitle: string;
  /** An event of the same bike and day to add the line to (D-63); null creates one. */
  eventId?: number | null;
};

export type ReplacementOutcome =
  | { ok: true; itemId: number; eventId: number; newComponentId: number }
  | {
      ok: false;
      reason:
        "not_found" | "already_removed" | "event_not_found" | "item_not_found" | "out_of_stock";
    }
  | { ok: false; reason: "before_fitting"; fittedAt: number };

/**
 * In one transaction: the old part is removed, the new one fitted in its slot (with
 * `replaces_component_id`), and a maintenance event records a `replaced` item with the price.
 */
export function replaceComponent(ctx: AccessContext, data: ReplacementData): ReplacementOutcome {
  return getDb().transaction((tx) => {
    const old = selectComponents(tx, ctx, eq(components.id, data.removedComponentId)).get();
    if (!old) return { ok: false, reason: "not_found" };
    if (old.removedAt) return { ok: false, reason: "already_removed" };
    if (data.at < old.installedAt.getTime()) {
      return { ok: false, reason: "before_fitting", fittedAt: old.installedAt.getTime() };
    }
    if (
      data.eventId != null &&
      !tx
        .select({ id: maintenanceEvents.id })
        .from(maintenanceEvents)
        .where(
          and(
            eq(maintenanceEvents.id, data.eventId),
            eq(maintenanceEvents.bikeId, old.bikeId),
            eq(maintenanceEvents.performedOn, data.on),
          ),
        )
        .get()
    ) {
      return { ok: false, reason: "event_not_found" };
    }
    if (data.fromItemId != null) {
      const stock = stockForReplacement(tx, ctx, data.fromItemId);
      if (!stock) return { ok: false, reason: "item_not_found" };
      if (stock.quantity < 1) return { ok: false, reason: "out_of_stock" };
    }

    tx.update(components)
      .set({
        removedAt: new Date(data.at),
        removalReason: data.reason,
        removalNote: data.removalNote,
      })
      .where(eq(components.id, old.id))
      .run();
    const { id: newComponentId } = tx
      .insert(components)
      .values({
        bikeId: old.bikeId,
        typeCode: old.typeCode,
        position: old.position,
        brand: data.newPart.brand,
        model: data.newPart.model,
        reference: data.newPart.reference ?? null,
        inventoryItemId: data.fromItemId ?? null,
        origin: replacementOrigin(data.reason),
        replacesComponentId: old.id,
        installedAt: new Date(data.at),
        purchasePriceCents: data.newPart.priceCents,
      })
      .returning({ id: components.id })
      .get();
    const eventId =
      data.eventId ??
      tx
        .insert(maintenanceEvents)
        .values({
          bikeId: old.bikeId,
          performedOn: data.on,
          title: data.eventTitle,
          performedBy: "self",
          createdBy: ctx.user.id,
          createdAt: new Date(data.recordedAt),
        })
        .returning({ id: maintenanceEvents.id })
        .get().id;
    const { id: itemId } = tx
      .insert(maintenanceItems)
      .values({
        eventId,
        action: "replaced",
        componentId: old.id,
        newComponentId,
        costCents: data.newPart.priceCents,
      })
      .returning({ id: maintenanceItems.id })
      .get();
    if (data.fromItemId != null) {
      tx.insert(inventoryMovements)
        .values({
          itemId: data.fromItemId,
          occurredAt: new Date(data.at),
          kind: "use",
          quantityDelta: -1,
          unitCostCents: data.newPart.priceCents,
          maintenanceItemId: itemId,
          createdBy: ctx.user.id,
        })
        .run();
    }
    return { ok: true, itemId, eventId, newComponentId };
  });
}

export type UndoOutcome = { ok: true } | { ok: false; reason: "not_found" | "too_late" };

/**
 * Undoes a replacement (D-60): deletes the `replaced` item, the part it fitted and the event if
 * nothing else is in it, and puts the old part back. Refused when something was built on it
 * since (the new part was replaced or used by another maintenance line).
 */
export function undoReplacement(ctx: AccessContext, itemId: number): UndoOutcome {
  return getDb().transaction((tx) => {
    const item = tx
      .select({
        id: maintenanceItems.id,
        eventId: maintenanceItems.eventId,
        action: maintenanceItems.action,
        oldId: maintenanceItems.componentId,
        newId: maintenanceItems.newComponentId,
      })
      .from(maintenanceItems)
      .innerJoin(maintenanceEvents, eq(maintenanceEvents.id, maintenanceItems.eventId))
      .innerJoin(bikes, eq(bikes.id, maintenanceEvents.bikeId))
      .where(and(eq(maintenanceItems.id, itemId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get();
    if (!item || item.action !== "replaced" || item.oldId == null || item.newId == null) {
      return { ok: false, reason: "not_found" };
    }
    const fitted = tx.select().from(components).where(eq(components.id, item.newId)).get();
    const old = tx.select().from(components).where(eq(components.id, item.oldId)).get();
    if (!fitted || !old) return { ok: false, reason: "not_found" };

    const builtOn =
      fitted.removedAt != null ||
      tx
        .select({ id: components.id })
        .from(components)
        .where(eq(components.replacesComponentId, fitted.id))
        .get() != null ||
      tx
        .select({ id: maintenanceItems.id })
        .from(maintenanceItems)
        .where(
          or(
            eq(maintenanceItems.componentId, fitted.id),
            eq(maintenanceItems.newComponentId, fitted.id),
          ),
        )
        .all()
        .some((row) => row.id !== item.id) ||
      old.removedAt?.getTime() !== fitted.installedAt.getTime();
    if (builtOn) return { ok: false, reason: "too_late" };

    // The stock movement goes first: it points to the line (D-60, all four together).
    tx.delete(inventoryMovements).where(eq(inventoryMovements.maintenanceItemId, item.id)).run();
    tx.delete(maintenanceItems).where(eq(maintenanceItems.id, item.id)).run();
    tx.delete(components).where(eq(components.id, fitted.id)).run();
    tx.update(components)
      .set({ removedAt: null, removalReason: null, removalNote: null })
      .where(eq(components.id, old.id))
      .run();
    const remaining = tx
      .select({ id: maintenanceItems.id })
      .from(maintenanceItems)
      .where(eq(maintenanceItems.eventId, item.eventId))
      .get();
    if (!remaining)
      tx.delete(maintenanceEvents).where(eq(maintenanceEvents.id, item.eventId)).run();
    return { ok: true };
  });
}

// --- Maintenance events (read) ----------------------------------------------------------------------

export type MaintenanceItem = {
  id: number;
  action: MaintenanceAction;
  ruleId: number | null;
  componentId: number | null;
  newComponentId: number | null;
  description: string | null;
  costCents: number | null;
  measurementValue: number | null;
  measurementUnit: MeasurementUnit | null;
};

export type MaintenanceEvent = {
  id: number;
  bikeId: number;
  performedOn: LocalDate;
  title: string;
  performedBy: MaintenancePerformer;
  shop: { id: number; name: string; kind: ShopKind } | null;
  totalCostCents: number | null;
  notes: string | null;
  createdAt: number;
  items: MaintenanceItem[];
};

/** The maintenance events of a bike of the workspace (all bikes when `bikeId` is null), newest first. */
export function listMaintenanceEvents(
  ctx: AccessContext,
  bikeId: number | null,
): MaintenanceEvent[] {
  const db = getDb();
  const events = db
    .select({
      id: maintenanceEvents.id,
      bikeId: maintenanceEvents.bikeId,
      performedOn: maintenanceEvents.performedOn,
      title: maintenanceEvents.title,
      performedBy: maintenanceEvents.performedBy,
      totalCostCents: maintenanceEvents.totalCostCents,
      notes: maintenanceEvents.notes,
      createdAt: maintenanceEvents.createdAt,
      shopId: shops.id,
      shopName: shops.name,
      shopKind: shops.kind,
    })
    .from(maintenanceEvents)
    .innerJoin(bikes, eq(bikes.id, maintenanceEvents.bikeId))
    .leftJoin(shops, eq(shops.id, maintenanceEvents.shopId))
    .where(
      and(
        eq(bikes.workspaceId, ctx.workspace.id),
        bikeId == null ? undefined : eq(maintenanceEvents.bikeId, bikeId),
      ),
    )
    .orderBy(desc(maintenanceEvents.performedOn), desc(maintenanceEvents.id))
    .all();
  if (!events.length) return [];
  const items = db
    .select()
    .from(maintenanceItems)
    .where(
      inArray(
        maintenanceItems.eventId,
        events.map((event) => event.id),
      ),
    )
    .orderBy(asc(maintenanceItems.id))
    .all();
  return events.map(({ shopId, shopName, shopKind, createdAt, ...event }) => ({
    ...event,
    createdAt: createdAt.getTime(),
    shop:
      shopId != null && shopName != null && shopKind != null
        ? { id: shopId, name: shopName, kind: shopKind }
        : null,
    items: items
      .filter((item) => item.eventId === event.id)
      .map((item) => ({
        id: item.id,
        action: item.action,
        componentId: item.componentId,
        newComponentId: item.newComponentId,
        ruleId: item.ruleId,
        description: item.description,
        costCents: item.costCents,
        measurementValue: item.measurementValue,
        measurementUnit: item.measurementUnit,
      })),
  }));
}
