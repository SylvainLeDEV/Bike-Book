import "server-only";
import { and, asc, eq, inArray, or, type SQL, type SQLWrapper } from "drizzle-orm";
import type {
  AttachmentKind,
  AttachmentOwnerKind,
  ComponentPosition,
  ComponentTypeCode,
  RideType,
} from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import { allowedKinds, becomesCover, canBeCover, keepsCover } from "@/server/domain/attachments";
import { removeStoredFiles } from "@/server/files/storage";
import type { AccessContext } from "./access-context";
import { getDb, type Tx } from "./client";
import {
  attachments,
  bikes,
  components,
  inventoryItems,
  maintenanceEvents,
  procedureRuns,
  procedureRunSteps,
  procedures,
  procedureSteps,
  rides,
  tasks,
} from "./schema";

// Attachments of the workspace (feature 10, D-45). An attachment belongs to exactly one element
// and inherits its workspace through it (D-25): every function checks that element first.
// Rows deleted here, or by a cascade from their element, take their files with them once the
// transaction is committed (`withFileCleanup`).

export type AttachmentOwner = { kind: AttachmentOwnerKind; id: number };

export type Attachment = {
  id: number;
  owner: AttachmentOwner;
  kind: AttachmentKind;
  storagePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  widthPx: number | null;
  heightPx: number | null;
  takenAt: number | null;
  caption: string | null;
  createdAt: number;
};

export type AttachmentData = Omit<Attachment, "id" | "owner" | "createdAt">;

export type AttachmentPatch = {
  caption?: string | null;
  kind?: AttachmentKind;
  takenAt?: number;
};

type Outcome<T = object> = ({ ok: true } & T) | { ok: false; reason: "not_found" | "invalid" };

const OWNER_COLUMNS = {
  bike: attachments.bikeId,
  component: attachments.componentId,
  maintenance_event: attachments.maintenanceEventId,
  ride: attachments.rideId,
  task: attachments.taskId,
  inventory_item: attachments.inventoryItemId,
  procedure: attachments.procedureId,
  procedure_step: attachments.procedureStepId,
  procedure_run_step: attachments.procedureRunStepId,
} as const;

const OWNER_KEYS = {
  bike: "bikeId",
  component: "componentId",
  maintenance_event: "maintenanceEventId",
  ride: "rideId",
  task: "taskId",
  inventory_item: "inventoryItemId",
  procedure: "procedureId",
  procedure_step: "procedureStepId",
  procedure_run_step: "procedureRunStepId",
} as const;

type AttachmentRow = typeof attachments.$inferSelect;

function ownerOf(row: AttachmentRow): AttachmentOwner {
  for (const [kind, key] of Object.entries(OWNER_KEYS) as [
    AttachmentOwnerKind,
    keyof AttachmentRow,
  ][]) {
    const id = row[key];
    if (typeof id === "number") return { kind, id };
  }
  throw new Error(`Attachment ${row.id} has no owner`);
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    owner: ownerOf(row),
    kind: row.kind,
    storagePath: row.storagePath,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    widthPx: row.widthPx,
    heightPx: row.heightPx,
    takenAt: row.takenAt?.getTime() ?? null,
    caption: row.caption,
    createdAt: row.createdAt.getTime(),
  };
}

/**
 * The element, if it belongs to the workspace, with the bike it concerns (null for a general
 * task, a workshop item or a procedure) and its current cover (bikes and items only).
 */
function findOwner(
  tx: Tx,
  ctx: AccessContext,
  owner: AttachmentOwner,
): { bikeId: number | null; coverId: number | null } | null {
  const ws = ctx.workspace.id;
  switch (owner.kind) {
    case "bike": {
      const row = tx
        .select({ id: bikes.id, cover: bikes.coverAttachmentId })
        .from(bikes)
        .where(and(eq(bikes.id, owner.id), eq(bikes.workspaceId, ws)))
        .get();
      return row ? { bikeId: row.id, coverId: row.cover } : null;
    }
    case "component":
    case "maintenance_event":
    case "ride": {
      const table = { component: components, maintenance_event: maintenanceEvents, ride: rides }[
        owner.kind
      ];
      const row = tx
        .select({ bikeId: table.bikeId })
        .from(table)
        .innerJoin(bikes, eq(bikes.id, table.bikeId))
        .where(and(eq(table.id, owner.id), eq(bikes.workspaceId, ws)))
        .get();
      return row ? { bikeId: row.bikeId, coverId: null } : null;
    }
    case "task": {
      const row = tx
        .select({ bikeId: tasks.bikeId })
        .from(tasks)
        .where(and(eq(tasks.id, owner.id), eq(tasks.workspaceId, ws)))
        .get();
      return row ? { bikeId: row.bikeId, coverId: null } : null;
    }
    case "inventory_item": {
      const row = tx
        .select({ cover: inventoryItems.photoAttachmentId })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.id, owner.id), eq(inventoryItems.workspaceId, ws)))
        .get();
      return row ? { bikeId: null, coverId: row.cover } : null;
    }
    case "procedure": {
      const row = tx
        .select({ id: procedures.id })
        .from(procedures)
        .where(and(eq(procedures.id, owner.id), eq(procedures.workspaceId, ws)))
        .get();
      return row ? { bikeId: null, coverId: null } : null;
    }
    case "procedure_step": {
      const row = tx
        .select({ id: procedureSteps.id })
        .from(procedureSteps)
        .innerJoin(procedures, eq(procedures.id, procedureSteps.procedureId))
        .where(and(eq(procedureSteps.id, owner.id), eq(procedures.workspaceId, ws)))
        .get();
      return row ? { bikeId: null, coverId: null } : null;
    }
    case "procedure_run_step": {
      const row = tx
        .select({ bikeId: procedureRuns.bikeId })
        .from(procedureRunSteps)
        .innerJoin(procedureRuns, eq(procedureRuns.id, procedureRunSteps.runId))
        .where(and(eq(procedureRunSteps.id, owner.id), eq(procedureRuns.workspaceId, ws)))
        .get();
      return row ? { bikeId: row.bikeId, coverId: null } : null;
    }
  }
}

/** What the screens need to name an element: its title, its date, its bike. */
export type OwnerDescription = { bikeName: string | null } & (
  | { kind: "bike" }
  | {
      kind: "component";
      typeCode: ComponentTypeCode;
      position: ComponentPosition;
      brand: string | null;
      model: string | null;
    }
  | { kind: "maintenance_event"; title: string; performedOn: LocalDate }
  | {
      kind: "ride";
      title: string | null;
      location: string | null;
      rideType: RideType;
      startedAt: number;
    }
  | { kind: "task"; title: string }
  | { kind: "inventory_item"; name: string }
  | { kind: "procedure"; title: string }
  /** `number`: the step's place, from 1. */
  | { kind: "procedure_step"; procedureTitle: string; number: number }
  /** A run's step: the event it wrote once done (D-87), else the run in progress. */
  | {
      kind: "procedure_run_step";
      runTitle: string;
      number: number;
      event: { id: number; performedOn: LocalDate } | null;
    }
);

/** Names an element of the workspace, or null. */
export function describeOwner(ctx: AccessContext, owner: AttachmentOwner): OwnerDescription | null {
  const db = getDb();
  const ws = ctx.workspace.id;
  const bikeName = (bikeId: number | null) =>
    bikeId == null
      ? null
      : (db
          .select({ name: bikes.name })
          .from(bikes)
          .where(and(eq(bikes.id, bikeId), eq(bikes.workspaceId, ws)))
          .get()?.name ?? null);
  switch (owner.kind) {
    case "bike": {
      const name = bikeName(owner.id);
      return name == null ? null : { kind: "bike", bikeName: name };
    }
    case "component": {
      const row = db
        .select({
          bikeName: bikes.name,
          typeCode: components.typeCode,
          position: components.position,
          brand: components.brand,
          model: components.model,
        })
        .from(components)
        .innerJoin(bikes, eq(bikes.id, components.bikeId))
        .where(and(eq(components.id, owner.id), eq(bikes.workspaceId, ws)))
        .get();
      return row
        ? { kind: "component", ...row, typeCode: row.typeCode as ComponentTypeCode }
        : null;
    }
    case "maintenance_event": {
      const row = db
        .select({
          bikeName: bikes.name,
          title: maintenanceEvents.title,
          performedOn: maintenanceEvents.performedOn,
        })
        .from(maintenanceEvents)
        .innerJoin(bikes, eq(bikes.id, maintenanceEvents.bikeId))
        .where(and(eq(maintenanceEvents.id, owner.id), eq(bikes.workspaceId, ws)))
        .get();
      return row ? { kind: "maintenance_event", ...row } : null;
    }
    case "ride": {
      const row = db
        .select({
          bikeName: bikes.name,
          title: rides.title,
          location: rides.location,
          rideType: rides.rideType,
          startedAt: rides.startedAt,
        })
        .from(rides)
        .innerJoin(bikes, eq(bikes.id, rides.bikeId))
        .where(and(eq(rides.id, owner.id), eq(bikes.workspaceId, ws)))
        .get();
      return row ? { kind: "ride", ...row, startedAt: row.startedAt.getTime() } : null;
    }
    case "task": {
      const row = db
        .select({ title: tasks.title, bikeId: tasks.bikeId })
        .from(tasks)
        .where(and(eq(tasks.id, owner.id), eq(tasks.workspaceId, ws)))
        .get();
      return row ? { kind: "task", title: row.title, bikeName: bikeName(row.bikeId) } : null;
    }
    case "inventory_item": {
      const row = db
        .select({ name: inventoryItems.name })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.id, owner.id), eq(inventoryItems.workspaceId, ws)))
        .get();
      return row ? { kind: "inventory_item", name: row.name, bikeName: null } : null;
    }
    case "procedure": {
      const row = db
        .select({ title: procedures.title })
        .from(procedures)
        .where(and(eq(procedures.id, owner.id), eq(procedures.workspaceId, ws)))
        .get();
      return row ? { kind: "procedure", title: row.title, bikeName: null } : null;
    }
    case "procedure_step": {
      const row = db
        .select({ procedureId: procedures.id, title: procedures.title })
        .from(procedureSteps)
        .innerJoin(procedures, eq(procedures.id, procedureSteps.procedureId))
        .where(and(eq(procedureSteps.id, owner.id), eq(procedures.workspaceId, ws)))
        .get();
      if (!row) return null;
      const order = db
        .select({ id: procedureSteps.id })
        .from(procedureSteps)
        .where(eq(procedureSteps.procedureId, row.procedureId))
        .orderBy(asc(procedureSteps.sortOrder), asc(procedureSteps.id))
        .all();
      return {
        kind: "procedure_step",
        procedureTitle: row.title,
        number: order.findIndex((step) => step.id === owner.id) + 1,
        bikeName: null,
      };
    }
    case "procedure_run_step": {
      const row = db
        .select({
          runId: procedureRuns.id,
          title: procedureRuns.title,
          bikeId: procedureRuns.bikeId,
          eventId: maintenanceEvents.id,
          performedOn: maintenanceEvents.performedOn,
        })
        .from(procedureRunSteps)
        .innerJoin(procedureRuns, eq(procedureRuns.id, procedureRunSteps.runId))
        .leftJoin(maintenanceEvents, eq(maintenanceEvents.id, procedureRuns.maintenanceEventId))
        .where(and(eq(procedureRunSteps.id, owner.id), eq(procedureRuns.workspaceId, ws)))
        .get();
      if (!row) return null;
      const order = db
        .select({ id: procedureRunSteps.id })
        .from(procedureRunSteps)
        .where(eq(procedureRunSteps.runId, row.runId))
        .orderBy(asc(procedureRunSteps.sortOrder), asc(procedureRunSteps.id))
        .all();
      return {
        kind: "procedure_run_step",
        runTitle: row.title,
        number: order.findIndex((step) => step.id === owner.id) + 1,
        event:
          row.eventId != null && row.performedOn != null
            ? { id: row.eventId, performedOn: row.performedOn }
            : null,
        bikeName: bikeName(row.bikeId),
      };
    }
  }
}

/** The cover of a bike or a workshop item (null for other elements, or without one). */
export function coverOf(ctx: AccessContext, owner: AttachmentOwner): number | null {
  return getDb().transaction((tx) => findOwner(tx, ctx, owner)?.coverId ?? null);
}

/** Whether the element exists in the workspace: checked before a file is written. */
export function ownsAttachmentTarget(ctx: AccessContext, owner: AttachmentOwner): boolean {
  return getDb().transaction((tx) => findOwner(tx, ctx, owner) != null);
}

function setCoverColumn(tx: Tx, owner: AttachmentOwner, attachmentId: number | null) {
  if (owner.kind === "bike") {
    tx.update(bikes).set({ coverAttachmentId: attachmentId }).where(eq(bikes.id, owner.id)).run();
  } else if (owner.kind === "inventory_item") {
    tx.update(inventoryItems)
      .set({ photoAttachmentId: attachmentId })
      .where(eq(inventoryItems.id, owner.id))
      .run();
  }
}

function clearCoversOf(tx: Tx, attachmentId: number) {
  tx.update(bikes)
    .set({ coverAttachmentId: null })
    .where(eq(bikes.coverAttachmentId, attachmentId))
    .run();
  tx.update(inventoryItems)
    .set({ photoAttachmentId: null })
    .where(eq(inventoryItems.photoAttachmentId, attachmentId))
    .run();
}

/**
 * Records an uploaded file for an element of the workspace. A photo becomes the cover of a bike
 * or item that has none, or when `asCover` asks for it (D-75).
 */
export function createAttachment(
  ctx: AccessContext,
  owner: AttachmentOwner,
  data: AttachmentData,
  options: { asCover?: boolean } = {},
): Outcome<{ attachment: Attachment }> {
  return getDb().transaction((tx) => {
    const target = findOwner(tx, ctx, owner);
    if (!target) return { ok: false, reason: "not_found" };
    if (!allowedKinds(data.mimeType.startsWith("image/")).includes(data.kind)) {
      return { ok: false, reason: "invalid" };
    }
    const row = tx
      .insert(attachments)
      .values({
        ...data,
        takenAt: data.takenAt == null ? null : new Date(data.takenAt),
        [OWNER_KEYS[owner.kind]]: owner.id,
      })
      .returning()
      .get();
    const coverable = owner.kind === "bike" || owner.kind === "inventory_item";
    if (
      coverable &&
      (becomesCover(data.kind, target.coverId) || (options.asCover && data.kind === "photo"))
    ) {
      setCoverColumn(tx, owner, row.id);
    }
    return { ok: true, attachment: toAttachment(row) };
  });
}

/** The attachments of one element, oldest first, or null when it is not in the workspace. */
export function listAttachments(ctx: AccessContext, owner: AttachmentOwner): Attachment[] | null {
  const db = getDb();
  return db.transaction((tx) => {
    if (!findOwner(tx, ctx, owner)) return null;
    return tx
      .select()
      .from(attachments)
      .where(eq(OWNER_COLUMNS[owner.kind], owner.id))
      .orderBy(asc(attachments.createdAt), asc(attachments.id))
      .all()
      .map(toAttachment);
  });
}

/**
 * What lies below a bike: its own attachments and those of its components, events, rides, tasks,
 * and the photos taken during its runs (D-87).
 */
function bikeScope(tx: Tx, bikeId: number): SQL {
  const of = <T extends typeof components | typeof maintenanceEvents | typeof rides>(table: T) =>
    tx.select({ id: table.id }).from(table).where(eq(table.bikeId, bikeId));
  return or(
    eq(attachments.bikeId, bikeId),
    inArray(attachments.componentId, of(components)),
    inArray(attachments.maintenanceEventId, of(maintenanceEvents)),
    inArray(attachments.rideId, of(rides)),
    inArray(
      attachments.taskId,
      tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.bikeId, bikeId)),
    ),
    runScope(
      tx,
      tx
        .select({ id: procedureRuns.id })
        .from(procedureRuns)
        .where(eq(procedureRuns.bikeId, bikeId)),
    ),
  )!;
}

/** The photos of runs' steps (D-87). */
function runScope(tx: Tx, runIds: SQLWrapper | number[]): SQL {
  return inArray(
    attachments.procedureRunStepId,
    tx
      .select({ id: procedureRunSteps.id })
      .from(procedureRunSteps)
      .where(inArray(procedureRunSteps.runId, runIds)),
  );
}

/** Files of a run's steps, read before it is abandoned or its event deleted. */
export function runAttachmentPaths(runId: number): string[] {
  return attachmentPaths((tx) => runScope(tx, [runId]));
}

/** Files of some run steps, read before they are removed. */
export function runStepAttachmentPaths(stepIds: number[]): string[] {
  return stepIds.length
    ? attachmentPaths(() => inArray(attachments.procedureRunStepId, stepIds))
    : [];
}

/**
 * Everything attached to a bike and its elements (the bike page's gallery and documents), or
 * null when the bike is not in the workspace.
 */
export function listBikeAttachments(ctx: AccessContext, bikeId: number): Attachment[] | null {
  return getDb().transaction((tx) => {
    if (!findOwner(tx, ctx, { kind: "bike", id: bikeId })) return null;
    return tx
      .select()
      .from(attachments)
      .where(bikeScope(tx, bikeId))
      .orderBy(asc(attachments.createdAt), asc(attachments.id))
      .all()
      .map(toAttachment);
  });
}

/** The attachments of several workshop items of the workspace (the workshop's thumbnails). */
export function listItemAttachments(ctx: AccessContext): Attachment[] {
  const db = getDb();
  return db
    .select()
    .from(attachments)
    .where(
      inArray(
        attachments.inventoryItemId,
        db
          .select({ id: inventoryItems.id })
          .from(inventoryItems)
          .where(eq(inventoryItems.workspaceId, ctx.workspace.id)),
      ),
    )
    .orderBy(asc(attachments.createdAt), asc(attachments.id))
    .all()
    .map(toAttachment);
}

function ownedAttachment(tx: Tx, ctx: AccessContext, attachmentId: number) {
  const row = tx.select().from(attachments).where(eq(attachments.id, attachmentId)).get();
  if (!row) return null;
  const attachment = toAttachment(row);
  const target = findOwner(tx, ctx, attachment.owner);
  return target ? { attachment, target } : null;
}

/** One attachment, if its element belongs to the workspace (downloads, D-25). */
export function getAttachment(ctx: AccessContext, attachmentId: number): Attachment | null {
  return getDb().transaction((tx) => ownedAttachment(tx, ctx, attachmentId)?.attachment ?? null);
}

/**
 * Changes the caption, the kind or the date taken. An attachment that stops being a photo is no
 * longer a cover (D-75); a PDF never becomes a photo.
 */
export function updateAttachment(
  ctx: AccessContext,
  attachmentId: number,
  patch: AttachmentPatch,
): Outcome<{ attachment: Attachment }> {
  return getDb().transaction((tx) => {
    const found = ownedAttachment(tx, ctx, attachmentId);
    if (!found) return { ok: false, reason: "not_found" };
    const { attachment } = found;
    const isImage = attachment.mimeType.startsWith("image/");
    if (patch.kind && !allowedKinds(isImage).includes(patch.kind)) {
      return { ok: false, reason: "invalid" };
    }
    if (patch.takenAt != null && !isImage) return { ok: false, reason: "invalid" };
    const row = tx
      .update(attachments)
      .set({
        ...(patch.caption === undefined ? {} : { caption: patch.caption }),
        ...(patch.kind ? { kind: patch.kind } : {}),
        ...(patch.takenAt == null ? {} : { takenAt: new Date(patch.takenAt) }),
      })
      .where(eq(attachments.id, attachmentId))
      .returning()
      .get();
    if (!keepsCover(row.kind)) clearCoversOf(tx, attachmentId);
    return { ok: true, attachment: toAttachment(row) };
  });
}

/**
 * Sets (or, with `on: false`, removes) the cover of the bike or workshop item the photo belongs
 * to (D-75). Refused for any other attachment.
 */
export function setAttachmentCover(ctx: AccessContext, attachmentId: number, on: boolean): Outcome {
  return getDb().transaction((tx) => {
    const found = ownedAttachment(tx, ctx, attachmentId);
    if (!found) return { ok: false, reason: "not_found" };
    const { owner, kind } = found.attachment;
    const coverable = owner.kind === "bike" || owner.kind === "inventory_item";
    if (!canBeCover({ kind, ownedByTarget: coverable })) return { ok: false, reason: "invalid" };
    if (on) setCoverColumn(tx, owner, attachmentId);
    else if (found.target.coverId === attachmentId) setCoverColumn(tx, owner, null);
    return { ok: true };
  });
}

/** Deletes an attachment and its files (original and derived copies). A cover goes back to none. */
export function deleteAttachment(ctx: AccessContext, attachmentId: number): Outcome {
  const outcome = getDb().transaction((tx): Outcome<{ path: string }> => {
    const found = ownedAttachment(tx, ctx, attachmentId);
    if (!found) return { ok: false, reason: "not_found" };
    clearCoversOf(tx, attachmentId);
    tx.delete(attachments).where(eq(attachments.id, attachmentId)).run();
    return { ok: true, path: found.attachment.storagePath };
  });
  if (!outcome.ok) return outcome;
  removeStoredFiles([outcome.path]);
  return { ok: true };
}

// --- Files of rows deleted by a cascade ---------------------------------------------------------

/** The stored paths of the attachments matching `where` (read before a delete that may cascade). */
export function attachmentPaths(where: (tx: Tx) => SQL | undefined): string[] {
  return getDb().transaction((tx) => {
    const condition = where(tx);
    if (!condition) return [];
    return tx
      .select({ path: attachments.storagePath })
      .from(attachments)
      .where(condition)
      .all()
      .map((row) => row.path);
  });
}

/** Attachments below a bike (see `bikeScope`), for deletes inside it. */
export function bikeAttachmentPaths(bikeId: number | null | undefined): string[] {
  return bikeId == null ? [] : attachmentPaths((tx) => bikeScope(tx, bikeId));
}

/** What lies below workspaces: the attachments of all their elements (export, demo reset). */
export function workspaceScope(tx: Tx, workspaceIds: number[]): SQL {
  const bikeIds = tx
    .select({ id: bikes.id })
    .from(bikes)
    .where(inArray(bikes.workspaceId, workspaceIds));
  const under = <T extends typeof components | typeof maintenanceEvents | typeof rides>(t: T) =>
    tx.select({ id: t.id }).from(t).where(inArray(t.bikeId, bikeIds));
  return or(
    inArray(attachments.bikeId, bikeIds),
    inArray(attachments.componentId, under(components)),
    inArray(attachments.maintenanceEventId, under(maintenanceEvents)),
    inArray(attachments.rideId, under(rides)),
    inArray(
      attachments.taskId,
      tx.select({ id: tasks.id }).from(tasks).where(inArray(tasks.workspaceId, workspaceIds)),
    ),
    inArray(
      attachments.inventoryItemId,
      tx
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(inArray(inventoryItems.workspaceId, workspaceIds)),
    ),
    runScope(
      tx,
      tx
        .select({ id: procedureRuns.id })
        .from(procedureRuns)
        .where(inArray(procedureRuns.workspaceId, workspaceIds)),
    ),
    procedureScope(
      tx,
      tx
        .select({ id: procedures.id })
        .from(procedures)
        .where(inArray(procedures.workspaceId, workspaceIds)),
    ),
  )!;
}

/** The attachments of procedures and of their steps (D-86). */
function procedureScope(tx: Tx, procedureIds: SQLWrapper | number[]): SQL {
  return or(
    inArray(attachments.procedureId, procedureIds),
    inArray(
      attachments.procedureStepId,
      tx
        .select({ id: procedureSteps.id })
        .from(procedureSteps)
        .where(inArray(procedureSteps.procedureId, procedureIds)),
    ),
  )!;
}

/** Files of a procedure and of its steps, read before it is deleted. */
export function procedureAttachmentPaths(procedureId: number): string[] {
  return attachmentPaths((tx) => procedureScope(tx, [procedureId]));
}

/** Files of some steps, read before they are deleted (a step removed in the editor). */
export function stepAttachmentPaths(stepIds: number[]): string[] {
  return stepIds.length ? attachmentPaths(() => inArray(attachments.procedureStepId, stepIds)) : [];
}

/** Everything attached to the elements of these workspaces (the demo reset deletes them whole). */
export function workspaceAttachmentPaths(workspaceIds: number[]): string[] {
  return workspaceIds.length ? attachmentPaths((tx) => workspaceScope(tx, workspaceIds)) : [];
}

/**
 * Runs a write that may delete attachment rows by cascade (a ride, an event, a part, a
 * workspace), then deletes the files of those of `candidates` whose rows are gone. Files go
 * after the commit: a rolled-back write keeps them.
 */
export function withFileCleanup<T>(candidates: string[], write: () => T): T {
  const result = write();
  if (candidates.length) {
    const kept = new Set(
      getDb()
        .select({ path: attachments.storagePath })
        .from(attachments)
        .where(inArray(attachments.storagePath, candidates))
        .all()
        .map((row) => row.path),
    );
    removeStoredFiles(candidates.filter((path) => !kept.has(path)));
  }
  return result;
}
