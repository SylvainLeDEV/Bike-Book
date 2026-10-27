import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { MaintenanceAction, MeasurementUnit, ShopKind } from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import type { AccessContext } from "./access-context";
import { getDb } from "./client";
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
    const partIds = [
      ...new Set(
        data.lines.flatMap((line) => (line.componentId == null ? [] : [line.componentId])),
      ),
    ];
    if (partIds.length) {
      const found = tx
        .select({ id: components.id })
        .from(components)
        .where(and(eq(components.bikeId, data.bikeId), inArray(components.id, partIds)))
        .all();
      if (found.length !== partIds.length) return { ok: false, reason: "unknown_part" };
    }
    for (const line of data.lines) {
      if (line.ruleId != null && !ruleOfBike(tx, line.ruleId, data.bikeId)) {
        return { ok: false, reason: "unknown_rule" };
      }
    }
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

/**
 * Undoes "Entretien enregistré" (D-60): deletes the event and its lines. Refused once a
 * replacement was added to it (its parts are now on the bike).
 */
export function undoMaintenanceEvent(
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
    const replaced = tx
      .select({ id: maintenanceItems.id })
      .from(maintenanceItems)
      .where(and(eq(maintenanceItems.eventId, eventId), eq(maintenanceItems.action, "replaced")))
      .get();
    if (replaced) return { ok: false, reason: "too_late" };
    tx.delete(maintenanceEvents).where(eq(maintenanceEvents.id, eventId)).run();
    return { ok: true };
  });
}
