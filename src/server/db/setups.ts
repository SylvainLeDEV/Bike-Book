import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  DAMPER_ADJUSTERS,
  SUSPENSION_TYPE_CODES,
  type DamperAdjuster,
  type SpringType,
  type SuspensionTypeCode,
} from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import type { AccessContext } from "./access-context";
import { getDb, type Tx } from "./client";
import { bikes, components, setupSuspensions, setups, suspensionSpecs } from "./schema";

// Suspension specs of the parts and the setup log of the bikes (D-24, D-79). Both inherit the
// workspace through their bike (D-25): every function checks it first.

/** One count per damper adjuster; null: no such adjuster (specs) or not given (values). */
export type ClicksByAdjuster = Record<DamperAdjuster, number | null>;

/** What a suspension fork or a rear shock is (D-79). */
export type SuspensionSpecsData = {
  springType: SpringType;
  /** The part's own travel in mm: a fork's travel, a shock's stroke. */
  travelMm: number | null;
  /** Clicks from fully closed to fully open, per adjuster the part has. */
  maxClicks: ClicksByAdjuster;
};

export type SuspensionSpecs = SuspensionSpecsData & { componentId: number };

/** The values of one fork or rear shock in a setup; clicks counted from fully closed. */
export type SuspensionValues = {
  componentId: number;
  airPressurePsi: number | null;
  springRateLbPerIn: number | null;
  volumeSpacers: number | null;
  sagMm: number | null;
  clicks: ClicksByAdjuster;
};

export type SetupData = {
  setOn: LocalDate;
  label: string | null;
  notes: string | null;
  tireFrontPressureBar: number | null;
  tireRearPressureBar: number | null;
  suspensions: SuspensionValues[];
};

export type Setup = SetupData & { id: number; bikeId: number };

export type SaveSetupOutcome =
  { ok: true; setupId: number } | { ok: false; reason: "not_found" | "invalid_part" };

const MAX_CLICK_COLUMNS = {
  low_speed_rebound: "lowSpeedReboundMaxClicks",
  high_speed_rebound: "highSpeedReboundMaxClicks",
  low_speed_compression: "lowSpeedCompressionMaxClicks",
  high_speed_compression: "highSpeedCompressionMaxClicks",
} as const satisfies Record<DamperAdjuster, keyof typeof suspensionSpecs.$inferSelect>;

const CLICK_COLUMNS = {
  low_speed_rebound: "lowSpeedReboundClicks",
  high_speed_rebound: "highSpeedReboundClicks",
  low_speed_compression: "lowSpeedCompressionClicks",
  high_speed_compression: "highSpeedCompressionClicks",
} as const satisfies Record<DamperAdjuster, keyof typeof setupSuspensions.$inferSelect>;

function byAdjuster<T>(read: (adjuster: DamperAdjuster) => T): Record<DamperAdjuster, T> {
  return Object.fromEntries(DAMPER_ADJUSTERS.map((a) => [a, read(a)])) as Record<DamperAdjuster, T>;
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

// --- Suspension specs ----------------------------------------------------------------------------

/** The suspension specs of a bike's parts (fitted or removed), by component id. */
export function listSuspensionSpecs(ctx: AccessContext, bikeId: number): SuspensionSpecs[] {
  return getDb()
    .select({ specs: suspensionSpecs })
    .from(suspensionSpecs)
    .innerJoin(components, eq(components.id, suspensionSpecs.componentId))
    .innerJoin(bikes, eq(bikes.id, components.bikeId))
    .where(and(eq(bikes.id, bikeId), eq(bikes.workspaceId, ctx.workspace.id)))
    .all()
    .map(({ specs }) => ({
      componentId: specs.componentId,
      springType: specs.springType,
      travelMm: specs.travelMm,
      maxClicks: byAdjuster((a) => specs[MAX_CLICK_COLUMNS[a]]),
    }));
}

/**
 * Writes the specs of a fork or rear shock inside the caller's transaction (the component sheet):
 * null deletes them, which makes a fork rigid. The caller has checked the part's workspace.
 */
export function writeSuspensionSpecs(
  tx: Tx,
  componentId: number,
  data: SuspensionSpecsData | null,
): void {
  if (data == null) {
    tx.delete(suspensionSpecs).where(eq(suspensionSpecs.componentId, componentId)).run();
    return;
  }
  const values = {
    springType: data.springType,
    travelMm: data.travelMm,
    lowSpeedReboundMaxClicks: data.maxClicks.low_speed_rebound,
    highSpeedReboundMaxClicks: data.maxClicks.high_speed_rebound,
    lowSpeedCompressionMaxClicks: data.maxClicks.low_speed_compression,
    highSpeedCompressionMaxClicks: data.maxClicks.high_speed_compression,
  };
  tx.insert(suspensionSpecs)
    .values({ componentId, ...values })
    .onConflictDoUpdate({ target: suspensionSpecs.componentId, set: values })
    .run();
}

/**
 * "Débattement et molettes" from the setup tab (D-83): writes the specs of a fork or rear shock of
 * the workspace (a fork with specs is a suspension fork). False when the part is not one.
 */
export function saveSuspensionSpecs(
  ctx: AccessContext,
  componentId: number,
  data: SuspensionSpecsData,
): boolean {
  return getDb().transaction((tx) => {
    const part = tx
      .select({ id: components.id, typeCode: components.typeCode })
      .from(components)
      .innerJoin(bikes, eq(bikes.id, components.bikeId))
      .where(and(eq(components.id, componentId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get();
    if (!part || !(SUSPENSION_TYPE_CODES as readonly string[]).includes(part.typeCode)) {
      return false;
    }
    writeSuspensionSpecs(tx, componentId, data);
    return true;
  });
}

// --- Setup log -------------------------------------------------------------------------------------

/** A bike's setups, the current one first (latest date, then latest recorded). */
export function listSetups(ctx: AccessContext, bikeId: number): Setup[] {
  const db = getDb();
  const rows = db
    .select({
      id: setups.id,
      bikeId: setups.bikeId,
      setOn: setups.setOn,
      label: setups.label,
      notes: setups.notes,
      tireFrontPressureBar: setups.tireFrontPressureBar,
      tireRearPressureBar: setups.tireRearPressureBar,
    })
    .from(setups)
    .innerJoin(bikes, eq(bikes.id, setups.bikeId))
    .where(and(eq(setups.bikeId, bikeId), eq(bikes.workspaceId, ctx.workspace.id)))
    .orderBy(desc(setups.setOn), desc(setups.id))
    .all();
  if (!rows.length) return [];
  const values = db
    .select()
    .from(setupSuspensions)
    .where(
      inArray(
        setupSuspensions.setupId,
        rows.map((row) => row.id),
      ),
    )
    .all();
  return rows.map((row) => ({
    ...row,
    suspensions: values
      .filter((value) => value.setupId === row.id)
      .sort((a, b) => a.componentId - b.componentId)
      .map((value) => ({
        componentId: value.componentId,
        airPressurePsi: value.airPressurePsi,
        springRateLbPerIn: value.springRateLbPerIn,
        volumeSpacers: value.volumeSpacers,
        sagMm: value.sagMm,
        clicks: byAdjuster((a) => value[CLICK_COLUMNS[a]]),
      })),
  }));
}

/** The bike of a setup of the workspace, or null. */
export function getSetupBikeId(ctx: AccessContext, setupId: number): number | null {
  return getDb().transaction((tx) => getSetupBikeIdIn(tx, ctx, setupId));
}

/** True when every part is a fork or rear shock of that bike, each named once. */
function partsBelongToBike(tx: Tx, bikeId: number, componentIds: number[]): boolean {
  if (!componentIds.length) return true;
  if (new Set(componentIds).size !== componentIds.length) return false;
  const found = tx
    .select({ id: components.id })
    .from(components)
    .where(
      and(
        eq(components.bikeId, bikeId),
        inArray(components.id, componentIds),
        inArray(components.typeCode, [...SUSPENSION_TYPE_CODES] as SuspensionTypeCode[]),
      ),
    )
    .all();
  return found.length === componentIds.length;
}

/** A row of values is kept only when something is given. */
function hasValues(values: SuspensionValues): boolean {
  return (
    values.airPressurePsi != null ||
    values.springRateLbPerIn != null ||
    values.volumeSpacers != null ||
    values.sagMm != null ||
    DAMPER_ADJUSTERS.some((a) => values.clicks[a] != null)
  );
}

function insertValues(tx: Tx, setupId: number, suspensions: SuspensionValues[]): void {
  const rows = suspensions.filter(hasValues).map((values) => ({
    setupId,
    componentId: values.componentId,
    airPressurePsi: values.airPressurePsi,
    springRateLbPerIn: values.springRateLbPerIn,
    volumeSpacers: values.volumeSpacers,
    sagMm: values.sagMm,
    lowSpeedReboundClicks: values.clicks.low_speed_rebound,
    highSpeedReboundClicks: values.clicks.high_speed_rebound,
    lowSpeedCompressionClicks: values.clicks.low_speed_compression,
    highSpeedCompressionClicks: values.clicks.high_speed_compression,
  }));
  if (rows.length) tx.insert(setupSuspensions).values(rows).run();
}

function header(data: SetupData) {
  return {
    setOn: data.setOn,
    label: data.label,
    notes: data.notes,
    tireFrontPressureBar: data.tireFrontPressureBar,
    tireRearPressureBar: data.tireRearPressureBar,
  };
}

/** Records a new setup of a bike of the workspace (a full copy of its values). */
export function createSetup(ctx: AccessContext, bikeId: number, data: SetupData): SaveSetupOutcome {
  return getDb().transaction((tx) => {
    if (!ownsBike(tx, ctx, bikeId)) return { ok: false, reason: "not_found" };
    const ids = data.suspensions.map((values) => values.componentId);
    if (!partsBelongToBike(tx, bikeId, ids)) return { ok: false, reason: "invalid_part" };
    const { id } = tx
      .insert(setups)
      .values({ bikeId, ...header(data) })
      .returning({ id: setups.id })
      .get();
    insertValues(tx, id, data.suspensions);
    return { ok: true, setupId: id };
  });
}

/** Rewrites a setup of the workspace: its header and all its values (a correction, D-70). */
export function updateSetup(
  ctx: AccessContext,
  setupId: number,
  data: SetupData,
): SaveSetupOutcome {
  return getDb().transaction((tx) => {
    const bikeId = getSetupBikeIdIn(tx, ctx, setupId);
    if (bikeId == null) return { ok: false, reason: "not_found" };
    const ids = data.suspensions.map((values) => values.componentId);
    if (!partsBelongToBike(tx, bikeId, ids)) return { ok: false, reason: "invalid_part" };
    tx.update(setups).set(header(data)).where(eq(setups.id, setupId)).run();
    tx.delete(setupSuspensions).where(eq(setupSuspensions.setupId, setupId)).run();
    insertValues(tx, setupId, data.suspensions);
    return { ok: true, setupId };
  });
}

/** Deletes a setup of the workspace and its values (a hard delete that fixes a mistake, D-70). */
export function deleteSetup(ctx: AccessContext, setupId: number): boolean {
  return getDb().transaction((tx) => {
    if (getSetupBikeIdIn(tx, ctx, setupId) == null) return false;
    tx.delete(setups).where(eq(setups.id, setupId)).run();
    return true;
  });
}

function getSetupBikeIdIn(tx: Tx, ctx: AccessContext, setupId: number): number | null {
  return (
    tx
      .select({ bikeId: setups.bikeId })
      .from(setups)
      .innerJoin(bikes, eq(bikes.id, setups.bikeId))
      .where(and(eq(setups.id, setupId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get()?.bikeId ?? null
  );
}
