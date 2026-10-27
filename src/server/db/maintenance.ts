import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { MaintenanceAction, MeasurementUnit, ShopKind } from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import type { AccessContext } from "./access-context";
import { getDb, type Tx } from "./client";
import { bikes, components, maintenanceEvents, maintenanceItems } from "./schema";
import { ruleOfBike } from "./rules";
import { resolveShopId } from "./shops";

// Maintenance entry (feature 5, D-63). Replacements are recorded by replaceComponent; this sheet
// writes the other interventions.

export type MaintenanceLineData = {
  action: Exclude<MaintenanceAction, "replaced">;
  componentId: number | null;
  /** The rule this line fulfils (feature 6): its counter restarts. */
  ruleId: number | null;
  description: string | null;
  costCents: number | null;
  measurementValue: number | null;
  measurementUnit: MeasurementUnit | null;
};

export type MaintenanceEventData = {
  bikeId: number;
  performedOn: LocalDate;
  title: string;
  performedBy: "self" | "shop";
  shop: { name: string; kind: ShopKind } | null;
  totalCostCents: number | null;
  notes: string | null;
  /** When it was recorded: `created_at`, which also dates a same-day event (D-61). */
  recordedAt: number;
  lines: MaintenanceLineData[];
};

/** Every part of the lines must belong to the bike, and every rule too. */
function checkLines(
  tx: Tx,
  bikeId: number,
  lines: MaintenanceLineData[],
): "unknown_part" | "unknown_rule" | null {
  const partIds = [
    ...new Set(lines.flatMap((line) => (line.componentId == null ? [] : [line.componentId]))),
  ];
  if (partIds.length) {
    const found = tx
      .select({ id: components.id })
      .from(components)
      .where(and(eq(components.bikeId, bikeId), inArray(components.id, partIds)))
      .all();
    if (found.length !== partIds.length) return "unknown_part";
  }
  for (const line of lines) {
    if (line.ruleId != null && !ruleOfBike(tx, line.ruleId, bikeId)) return "unknown_rule";
  }
  return null;
}

export type CreateEventOutcome =
  | { ok: true; eventId: number }
  | { ok: false; reason: "not_found" | "unknown_part" | "unknown_rule" };

/** Records an event and its lines in one transaction; every part must belong to the bike. */
export function createMaintenanceEvent(
  ctx: AccessContext,
  data: MaintenanceEventData,
): CreateEventOutcome {
  return getDb().transaction((tx) => {
    const owned = tx
      .select({ id: bikes.id })
      .from(bikes)
      .where(and(eq(bikes.id, data.bikeId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get();
    if (!owned) return { ok: false, reason: "not_found" };
    const refused = checkLines(tx, data.bikeId, data.lines);
    if (refused) return { ok: false, reason: refused };
    const { id: eventId } = tx
      .insert(maintenanceEvents)
      .values({
        bikeId: data.bikeId,
        performedOn: data.performedOn,
        title: data.title,
        performedBy: data.performedBy,
        shopId: data.performedBy === "shop" ? resolveShopId(tx, ctx, data.shop) : null,
        createdBy: ctx.user.id,
        totalCostCents: data.totalCostCents,
        notes: data.notes,
        createdAt: new Date(data.recordedAt),
      })
      .returning({ id: maintenanceEvents.id })
      .get();
    for (const line of data.lines) {
      tx.insert(maintenanceItems)
        .values({ ...line, eventId })
        .run();
    }
    return { ok: true, eventId };
  });
}

export type UpdateEventOutcome =
  | { ok: true }
  | { ok: false; reason: "not_found" | "unknown_part" | "unknown_rule" | "date_locked" };

/**
 * "Modifier l'entretien" (D-70): rewrites the event and its lines, except its replacements, which
 * stay as they are (undone from their own toast only). An event holding a replacement keeps its
 * date: the parts were fitted and removed at its instant. The bike and `created_at` never change.
 */
export function updateMaintenanceEvent(
  ctx: AccessContext,
  eventId: number,
  data: Omit<MaintenanceEventData, "bikeId" | "recordedAt">,
): UpdateEventOutcome {
  return getDb().transaction((tx) => {
    const event = tx
      .select({
        id: maintenanceEvents.id,
        bikeId: maintenanceEvents.bikeId,
        on: maintenanceEvents.performedOn,
      })
      .from(maintenanceEvents)
      .innerJoin(bikes, eq(bikes.id, maintenanceEvents.bikeId))
      .where(and(eq(maintenanceEvents.id, eventId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get();
    if (!event) return { ok: false, reason: "not_found" };
    if (data.performedOn !== event.on && hasReplacement(tx, eventId)) {
      return { ok: false, reason: "date_locked" };
    }
    const refused = checkLines(tx, event.bikeId, data.lines);
    if (refused) return { ok: false, reason: refused };
    tx.update(maintenanceEvents)
      .set({
        performedOn: data.performedOn,
        title: data.title,
        performedBy: data.performedBy,
        shopId: data.performedBy === "shop" ? resolveShopId(tx, ctx, data.shop) : null,
        totalCostCents: data.totalCostCents,
        notes: data.notes,
      })
      .where(eq(maintenanceEvents.id, eventId))
      .run();
    tx.delete(maintenanceItems)
      .where(and(eq(maintenanceItems.eventId, eventId), ne(maintenanceItems.action, "replaced")))
      .run();
    for (const line of data.lines) {
      tx.insert(maintenanceItems)
        .values({ ...line, eventId })
        .run();
    }
    return { ok: true };
  });
}

function hasReplacement(tx: Tx, eventId: number): boolean {
  return (
    tx
      .select({ id: maintenanceItems.id })
      .from(maintenanceItems)
      .where(and(eq(maintenanceItems.eventId, eventId), eq(maintenanceItems.action, "replaced")))
      .get() != null
  );
}

/**
 * Deletes an event and its lines: "Annuler" after "Entretien enregistré" (D-60) and "Supprimer
 * l'entretien" (D-70). Refused once it holds a replacement (its parts are on the bike).
 */
export function deleteMaintenanceEvent(
  ctx: AccessContext,
  eventId: number,
): { ok: true } | { ok: false; reason: "not_found" | "too_late" } {
  return getDb().transaction((tx) => {
    const event = tx
      .select({ id: maintenanceEvents.id })
      .from(maintenanceEvents)
      .innerJoin(bikes, eq(bikes.id, maintenanceEvents.bikeId))
      .where(and(eq(maintenanceEvents.id, eventId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get();
    if (!event) return { ok: false, reason: "not_found" };
    if (hasReplacement(tx, eventId)) return { ok: false, reason: "too_late" };
    tx.delete(maintenanceEvents).where(eq(maintenanceEvents.id, eventId)).run();
    return { ok: true };
  });
}
