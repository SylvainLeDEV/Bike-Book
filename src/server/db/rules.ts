import "server-only";
import { and, asc, eq, isNotNull, isNull, or } from "drizzle-orm";
import type { ComponentTypeCode } from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import type { RuleDefinition } from "@/server/domain/rules";
import type { AccessContext } from "./access-context";
import { getDb, type Tx } from "./client";
import {
  bikes,
  maintenanceEvents,
  maintenanceItems,
  maintenanceRules,
  ruleTemplates,
} from "./schema";

// Maintenance rules of the workspace's bikes (feature 6); they inherit the workspace through
// `bike_id` (D-25). Status, usage and ETA are computed by src/server/domain/rules.ts.

export type Rule = RuleDefinition & {
  bikeId: number;
  templateId: number | null;
  title: string;
  active: boolean;
  notes: string | null;
};

export type RuleData = {
  componentTypeCode: ComponentTypeCode | null;
  position: "front" | "rear" | null;
  title: string;
  intervalDistanceM: number | null;
  intervalWearS: number | null;
  intervalDays: number | null;
  warnRatio: number;
  resetOnReplacement: boolean;
  counterStartAt: number;
  active: boolean;
  notes: string | null;
};

const ruleColumns = {
  id: maintenanceRules.id,
  bikeId: maintenanceRules.bikeId,
  componentTypeCode: maintenanceRules.componentTypeCode,
  position: maintenanceRules.position,
  templateId: maintenanceRules.templateId,
  title: maintenanceRules.title,
  intervalDistanceM: maintenanceRules.intervalDistanceM,
  intervalWearS: maintenanceRules.intervalWearS,
  intervalDays: maintenanceRules.intervalDays,
  warnRatio: maintenanceRules.warnRatio,
  resetOnReplacement: maintenanceRules.resetOnReplacement,
  counterStartAt: maintenanceRules.counterStartAt,
  active: maintenanceRules.active,
  snoozeEndsOn: maintenanceRules.snoozeEndsOn,
  notes: maintenanceRules.notes,
};

/** The rules of a bike of the workspace (every bike when `bikeId` is null), in creation order. */
export function listRules(ctx: AccessContext, bikeId: number | null): Rule[] {
  return getDb()
    .select(ruleColumns)
    .from(maintenanceRules)
    .innerJoin(bikes, eq(bikes.id, maintenanceRules.bikeId))
    .where(
      and(
        eq(bikes.workspaceId, ctx.workspace.id),
        bikeId == null ? undefined : eq(maintenanceRules.bikeId, bikeId),
      ),
    )
    .orderBy(asc(maintenanceRules.id))
    .all()
    .map((row) => ({
      ...row,
      componentTypeCode: row.componentTypeCode as ComponentTypeCode | null,
      position: row.position === "front" || row.position === "rear" ? row.position : null,
      counterStartAt: row.counterStartAt.getTime(),
    }));
}

/** The maintenance lines that fulfilled a rule, with their event's date and recording instant. */
export function listRuleResets(
  ctx: AccessContext,
  bikeId: number | null,
): { ruleId: number; eventId: number; on: LocalDate; recordedAt: number }[] {
  return getDb()
    .select({
      ruleId: maintenanceItems.ruleId,
      eventId: maintenanceEvents.id,
      on: maintenanceEvents.performedOn,
      recordedAt: maintenanceEvents.createdAt,
    })
    .from(maintenanceItems)
    .innerJoin(maintenanceEvents, eq(maintenanceEvents.id, maintenanceItems.eventId))
    .innerJoin(bikes, eq(bikes.id, maintenanceEvents.bikeId))
    .where(
      and(
        eq(bikes.workspaceId, ctx.workspace.id),
        isNotNull(maintenanceItems.ruleId),
        bikeId == null ? undefined : eq(maintenanceEvents.bikeId, bikeId),
      ),
    )
    .all()
    .map((row) => ({ ...row, ruleId: row.ruleId!, recordedAt: row.recordedAt.getTime() }));
}

function ownsBike(tx: Tx, ctx: AccessContext, bikeId: number): boolean {
  return (
    tx
      .select({ id: bikes.id })
      .from(bikes)
      .where(and(eq(bikes.id, bikeId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get() != null
  );
}

function ownedRule(tx: Tx, ctx: AccessContext, ruleId: number) {
  return tx
    .select({ id: maintenanceRules.id, snoozeEndsOn: maintenanceRules.snoozeEndsOn })
    .from(maintenanceRules)
    .innerJoin(bikes, eq(bikes.id, maintenanceRules.bikeId))
    .where(and(eq(maintenanceRules.id, ruleId), eq(bikes.workspaceId, ctx.workspace.id)))
    .get();
}

/** Adds a rule to a bike of the workspace. */
export function createRule(
  ctx: AccessContext,
  bikeId: number,
  data: RuleData,
): { ok: true; ruleId: number } | { ok: false; reason: "not_found" } {
  return getDb().transaction((tx) => {
    if (!ownsBike(tx, ctx, bikeId)) return { ok: false, reason: "not_found" };
    const { id } = tx
      .insert(maintenanceRules)
      .values({ ...data, bikeId, counterStartAt: new Date(data.counterStartAt) })
      .returning({ id: maintenanceRules.id })
      .get();
    return { ok: true, ruleId: id };
  });
}

/** Changes a rule of the workspace (not its bike). */
export function updateRule(
  ctx: AccessContext,
  ruleId: number,
  data: RuleData,
): { ok: true } | { ok: false; reason: "not_found" } {
  return getDb().transaction((tx) => {
    if (!ownedRule(tx, ctx, ruleId)) return { ok: false, reason: "not_found" };
    tx.update(maintenanceRules)
      .set({ ...data, counterStartAt: new Date(data.counterStartAt) })
      .where(eq(maintenanceRules.id, ruleId))
      .run();
    return { ok: true };
  });
}

/** Snoozes a rule until a day (null: no snooze). Returns the previous value, for "Annuler". */
export function snoozeRule(
  ctx: AccessContext,
  ruleId: number,
  until: LocalDate | null,
): { ok: true; previous: LocalDate | null } | { ok: false; reason: "not_found" } {
  return getDb().transaction((tx) => {
    const rule = ownedRule(tx, ctx, ruleId);
    if (!rule) return { ok: false, reason: "not_found" };
    tx.update(maintenanceRules)
      .set({ snoozeEndsOn: until })
      .where(eq(maintenanceRules.id, ruleId))
      .run();
    return { ok: true, previous: rule.snoozeEndsOn };
  });
}

/**
 * Inside a component's transaction: rules copied from the chosen templates (built-in or the
 * workspace's own) for the new part's slot, counting from its fitting.
 */
export function insertRulesFromTemplates(
  tx: Tx,
  ctx: AccessContext,
  input: {
    bikeId: number;
    typeCode: ComponentTypeCode;
    position: "front" | "rear" | "none";
    templateIds: number[];
    counterStartAt: number;
  },
): number {
  let count = 0;
  for (const templateId of new Set(input.templateIds)) {
    const template = tx
      .select()
      .from(ruleTemplates)
      .where(
        and(
          eq(ruleTemplates.id, templateId),
          eq(ruleTemplates.componentTypeCode, input.typeCode),
          or(isNull(ruleTemplates.workspaceId), eq(ruleTemplates.workspaceId, ctx.workspace.id)),
        ),
      )
      .get();
    if (!template) continue;
    tx.insert(maintenanceRules)
      .values({
        bikeId: input.bikeId,
        componentTypeCode: input.typeCode,
        position: input.position === "none" ? null : input.position,
        templateId: template.id,
        title: template.title,
        intervalDistanceM: template.intervalDistanceM,
        intervalWearS: template.intervalWearS,
        intervalDays: template.intervalDays,
        counterStartAt: new Date(input.counterStartAt),
        notes: template.notes,
      })
      .run();
    count += 1;
  }
  return count;
}

/** True when the rule belongs to that bike (a maintenance line can only fulfil its bike's rules). */
export function ruleOfBike(tx: Tx, ruleId: number, bikeId: number): boolean {
  return (
    tx
      .select({ id: maintenanceRules.id })
      .from(maintenanceRules)
      .where(and(eq(maintenanceRules.id, ruleId), eq(maintenanceRules.bikeId, bikeId)))
      .get() != null
  );
}
