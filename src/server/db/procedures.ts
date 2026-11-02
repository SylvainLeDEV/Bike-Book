import "server-only";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { ComponentTypeCode, ProcedureDifficulty, ProcedureResourceKind } from "@/lib/enums";
import type { AccessContext } from "./access-context";
import { procedureAttachmentPaths, stepAttachmentPaths, withFileCleanup } from "./attachments";
import { getDb, type Tx } from "./client";
import {
  attachments,
  bikes,
  inventoryItems,
  procedureBikes,
  procedureItems,
  procedureResources,
  procedures,
  procedureSteps,
} from "./schema";

// Maintenance procedures ("fiches", D-47, D-82, D-86) of the workspace. A procedure carries the
// workspace; its bikes, steps, material and links are reached through it (D-25). Steps keep their
// ids when the procedure is edited, since their photos are attachments of theirs.

export type ProcedureStep = {
  id: number;
  instruction: string;
  note: string | null;
  torqueNm: number | null;
};

/** A step as listed: with the number of its photos, which the editor warns about (D-86). */
export type ListedStep = ProcedureStep & { photoCount: number };

/** Exactly one target: a workshop item, a part type for the bike, or a label (CHECK). */
export type ProcedureItemTarget =
  | { inventoryItemId: number; componentTypeCode?: never; label?: never }
  | { componentTypeCode: ComponentTypeCode; inventoryItemId?: never; label?: never }
  | { label: string; inventoryItemId?: never; componentTypeCode?: never };

export type ProcedureItem = { id: number; quantity: number | null } & ProcedureItemTarget;

export type ProcedureResource = {
  id: number;
  kind: ProcedureResourceKind;
  url: string | null;
  title: string | null;
  durationS: number | null;
  body: string | null;
};

export type Procedure = {
  id: number;
  title: string;
  description: string | null;
  componentTypeCode: ComponentTypeCode | null;
  modelHint: string | null;
  allBikes: boolean;
  bikeIds: number[];
  estimatedDurationS: number | null;
  difficulty: ProcedureDifficulty | null;
  archivedAt: number | null;
  updatedAt: number;
  /** In order. */
  steps: ListedStep[];
  items: ProcedureItem[];
  resources: ProcedureResource[];
};

/** What the editor saves: the header, then the ordered lists (a step without id is new). */
export type ProcedureData = {
  title: string;
  description: string | null;
  componentTypeCode: ComponentTypeCode | null;
  modelHint: string | null;
  allBikes: boolean;
  bikeIds: number[];
  estimatedDurationS: number | null;
  difficulty: ProcedureDifficulty | null;
  steps: (Omit<ProcedureStep, "id"> & { id: number | null })[];
  items: ({ quantity: number | null } & ProcedureItemTarget)[];
  resources: Omit<ProcedureResource, "id">[];
};

type Outcome<T = object> = ({ ok: true } & T) | { ok: false; reason: "not_found" };

/** Whether a procedure belongs to the workspace (rules and tasks point to one, D-86). */
export function ownsProcedure(tx: Tx, ctx: AccessContext, procedureId: number): boolean {
  return (
    tx
      .select({ id: procedures.id })
      .from(procedures)
      .where(and(eq(procedures.id, procedureId), eq(procedures.workspaceId, ctx.workspace.id)))
      .get() != null
  );
}

/** The bikes and workshop items a procedure names must all belong to the workspace. */
function ownsTargets(tx: Tx, ctx: AccessContext, data: ProcedureData): boolean {
  const bikeIds = [...new Set(data.bikeIds)];
  if (bikeIds.length) {
    const found = tx
      .select({ id: bikes.id })
      .from(bikes)
      .where(and(eq(bikes.workspaceId, ctx.workspace.id), inArray(bikes.id, bikeIds)))
      .all();
    if (found.length !== bikeIds.length) return false;
  }
  const itemIds = [
    ...new Set(data.items.flatMap((item) => (item.inventoryItemId ? [item.inventoryItemId] : []))),
  ];
  if (itemIds.length) {
    const found = tx
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(
        and(eq(inventoryItems.workspaceId, ctx.workspace.id), inArray(inventoryItems.id, itemIds)),
      )
      .all();
    if (found.length !== itemIds.length) return false;
  }
  return true;
}

const header = (data: ProcedureData) => ({
  title: data.title,
  description: data.description,
  componentTypeCode: data.componentTypeCode,
  modelHint: data.modelHint,
  allBikes: data.allBikes,
  estimatedDurationS: data.estimatedDurationS,
  difficulty: data.difficulty,
});

/** Rewrites the bikes, material and links; steps are handled apart (their ids are kept). */
function writeLists(tx: Tx, procedureId: number, data: ProcedureData) {
  tx.delete(procedureBikes).where(eq(procedureBikes.procedureId, procedureId)).run();
  if (!data.allBikes) {
    for (const bikeId of new Set(data.bikeIds)) {
      tx.insert(procedureBikes).values({ procedureId, bikeId }).run();
    }
  }
  tx.delete(procedureItems).where(eq(procedureItems.procedureId, procedureId)).run();
  data.items.forEach((item, sortOrder) => {
    tx.insert(procedureItems)
      .values({
        procedureId,
        inventoryItemId: item.inventoryItemId ?? null,
        componentTypeCode: item.componentTypeCode ?? null,
        label: item.label ?? null,
        quantity: item.quantity,
        sortOrder,
      })
      .run();
  });
  tx.delete(procedureResources).where(eq(procedureResources.procedureId, procedureId)).run();
  data.resources.forEach((resource, sortOrder) => {
    tx.insert(procedureResources)
      .values({ procedureId, ...resource, sortOrder })
      .run();
  });
}

/** Every procedure of the workspace, archived ones included, with its lists in order. */
export function listProcedures(ctx: AccessContext): Procedure[] {
  const db = getDb();
  const rows = db
    .select()
    .from(procedures)
    .where(eq(procedures.workspaceId, ctx.workspace.id))
    .orderBy(asc(procedures.id))
    .all();
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const bikeRows = db
    .select()
    .from(procedureBikes)
    .where(inArray(procedureBikes.procedureId, ids))
    .all();
  const steps = db
    .select()
    .from(procedureSteps)
    .where(inArray(procedureSteps.procedureId, ids))
    .orderBy(asc(procedureSteps.sortOrder), asc(procedureSteps.id))
    .all();
  const photos = new Map(
    db
      .select({ stepId: attachments.procedureStepId, n: count() })
      .from(attachments)
      .where(
        inArray(
          attachments.procedureStepId,
          steps.map((step) => step.id),
        ),
      )
      .groupBy(attachments.procedureStepId)
      .all()
      .map((row) => [row.stepId, row.n]),
  );
  const items = db
    .select()
    .from(procedureItems)
    .where(inArray(procedureItems.procedureId, ids))
    .orderBy(asc(procedureItems.sortOrder), asc(procedureItems.id))
    .all();
  const resources = db
    .select()
    .from(procedureResources)
    .where(inArray(procedureResources.procedureId, ids))
    .orderBy(asc(procedureResources.sortOrder), asc(procedureResources.id))
    .all();
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    componentTypeCode: row.componentTypeCode as ComponentTypeCode | null,
    modelHint: row.modelHint,
    allBikes: row.allBikes,
    bikeIds: bikeRows.filter((b) => b.procedureId === row.id).map((b) => b.bikeId),
    estimatedDurationS: row.estimatedDurationS,
    difficulty: row.difficulty,
    archivedAt: row.archivedAt?.getTime() ?? null,
    updatedAt: row.updatedAt.getTime(),
    steps: steps
      .filter((step) => step.procedureId === row.id)
      .map(({ id, instruction, note, torqueNm }) => ({
        id,
        instruction,
        note,
        torqueNm,
        photoCount: photos.get(id) ?? 0,
      })),
    items: items
      .filter((item) => item.procedureId === row.id)
      .map((item): ProcedureItem => {
        const target: ProcedureItemTarget =
          item.inventoryItemId != null
            ? { inventoryItemId: item.inventoryItemId }
            : item.componentTypeCode != null
              ? { componentTypeCode: item.componentTypeCode as ComponentTypeCode }
              : { label: item.label ?? "" };
        return { id: item.id, quantity: item.quantity, ...target };
      }),
    resources: resources
      .filter((resource) => resource.procedureId === row.id)
      .map(({ id, kind, url, title, durationS, body }) => ({
        id,
        kind,
        url,
        title,
        durationS,
        body,
      })),
  }));
}

/** A new procedure with its bikes, steps, material and links, in one transaction. */
export function createProcedure(
  ctx: AccessContext,
  data: ProcedureData,
): Outcome<{ procedureId: number }> {
  return getDb().transaction((tx) => {
    if (!ownsTargets(tx, ctx, data)) return { ok: false, reason: "not_found" };
    const { id } = tx
      .insert(procedures)
      .values({ workspaceId: ctx.workspace.id, ...header(data) })
      .returning({ id: procedures.id })
      .get();
    data.steps.forEach((step, sortOrder) => {
      tx.insert(procedureSteps)
        .values({
          procedureId: id,
          sortOrder,
          instruction: step.instruction,
          note: step.note,
          torqueNm: step.torqueNm,
        })
        .run();
    });
    writeLists(tx, id, data);
    return { ok: true, procedureId: id };
  });
}

/**
 * Saves the editor (D-86): the header and lists, the steps in their new order. A step keeps its
 * id (and its photos) when it is kept; a step removed takes its photos with it, files included.
 */
export function updateProcedure(
  ctx: AccessContext,
  procedureId: number,
  data: ProcedureData,
): Outcome {
  const kept = new Set(data.steps.flatMap((step) => (step.id == null ? [] : [step.id])));
  const removed = getDb()
    .select({ id: procedureSteps.id })
    .from(procedureSteps)
    .where(eq(procedureSteps.procedureId, procedureId))
    .all()
    .map((step) => step.id)
    .filter((id) => !kept.has(id));
  return withFileCleanup(stepAttachmentPaths(removed), () =>
    getDb().transaction((tx): Outcome => {
      if (!ownsProcedure(tx, ctx, procedureId) || !ownsTargets(tx, ctx, data)) {
        return { ok: false, reason: "not_found" };
      }
      const current = new Set(
        tx
          .select({ id: procedureSteps.id })
          .from(procedureSteps)
          .where(eq(procedureSteps.procedureId, procedureId))
          .all()
          .map((step) => step.id),
      );
      // A step id from elsewhere is refused, not moved into this procedure.
      if ([...kept].some((id) => !current.has(id))) return { ok: false, reason: "not_found" };
      tx.update(procedures).set(header(data)).where(eq(procedures.id, procedureId)).run();
      for (const id of current) {
        if (!kept.has(id)) tx.delete(procedureSteps).where(eq(procedureSteps.id, id)).run();
      }
      data.steps.forEach((step, sortOrder) => {
        const values = {
          sortOrder,
          instruction: step.instruction,
          note: step.note,
          torqueNm: step.torqueNm,
        };
        if (step.id == null)
          tx.insert(procedureSteps)
            .values({ procedureId, ...values })
            .run();
        else tx.update(procedureSteps).set(values).where(eq(procedureSteps.id, step.id)).run();
      });
      writeLists(tx, procedureId, data);
      return { ok: true };
    }),
  );
}

/** Archives a procedure (or brings it back): it leaves the lists, its links stay. */
export function setProcedureArchived(
  ctx: AccessContext,
  procedureId: number,
  archivedAt: number | null,
): Outcome {
  return getDb().transaction((tx) => {
    if (!ownsProcedure(tx, ctx, procedureId)) return { ok: false, reason: "not_found" };
    tx.update(procedures)
      .set({ archivedAt: archivedAt == null ? null : new Date(archivedAt) })
      .where(eq(procedures.id, procedureId))
      .run();
    return { ok: true };
  });
}

/**
 * Deletes a procedure for good (D-86): its steps, material, links and files go with it; the rules
 * and tasks that pointed to it lose the link (`ON DELETE SET NULL`).
 */
export function deleteProcedure(ctx: AccessContext, procedureId: number): Outcome {
  return withFileCleanup(procedureAttachmentPaths(procedureId), () =>
    getDb().transaction((tx): Outcome => {
      if (!ownsProcedure(tx, ctx, procedureId)) return { ok: false, reason: "not_found" };
      tx.delete(procedures).where(eq(procedures.id, procedureId)).run();
      return { ok: true };
    }),
  );
}

/**
 * "Ajouter à l'atelier" from a line typed as text (D-86): the line now names that workshop item.
 */
export function linkProcedureItem(
  ctx: AccessContext,
  procedureItemId: number,
  inventoryItemId: number,
): Outcome {
  return getDb().transaction((tx) => {
    const line = tx
      .select({ id: procedureItems.id })
      .from(procedureItems)
      .innerJoin(procedures, eq(procedures.id, procedureItems.procedureId))
      .where(
        and(eq(procedureItems.id, procedureItemId), eq(procedures.workspaceId, ctx.workspace.id)),
      )
      .get();
    const item = tx
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.id, inventoryItemId),
          eq(inventoryItems.workspaceId, ctx.workspace.id),
        ),
      )
      .get();
    if (!line || !item) return { ok: false, reason: "not_found" };
    tx.update(procedureItems)
      .set({ inventoryItemId, componentTypeCode: null, label: null })
      .where(eq(procedureItems.id, procedureItemId))
      .run();
    return { ok: true };
  });
}
