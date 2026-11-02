import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { MaintenanceAction, ProductLevel, RunStatus, TaskStatus } from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import {
  levelChange,
  productStock,
  stockQuantity,
  type StockChange,
} from "@/server/domain/inventory";
import type { AccessContext } from "./access-context";
import { runAttachmentPaths, runStepAttachmentPaths, withFileCleanup } from "./attachments";
import { getDb, type Tx } from "./client";
import { checkLines } from "./maintenance";
import {
  attachments,
  bikes,
  inventoryItems,
  inventoryMovements,
  maintenanceEvents,
  maintenanceItems,
  maintenanceRules,
  procedureBikes,
  procedureRuns,
  procedureRunSteps,
  procedures,
  procedureSteps,
  tasks,
} from "./schema";

// Runs ("suivi", D-82, D-87): one time the work is done, from a task, a rule or a procedure. Its
// steps are copied from the procedure when it starts; "Terminer" writes the maintenance event,
// the parts and product levels it took, the task done or the rule reset, in one transaction, and
// answers with what "Annuler" needs (D-60).

export type RunStep = {
  id: number;
  procedureStepId: number | null;
  instruction: string;
  note: string | null;
  torqueNm: number | null;
  doneAt: number | null;
  comment: string | null;
  photoCount: number;
};

export type Run = {
  id: number;
  bikeId: number | null;
  procedureId: number | null;
  taskId: number | null;
  ruleId: number | null;
  title: string;
  status: RunStatus;
  startedAt: number;
  finishedAt: number | null;
  maintenanceEventId: number | null;
};

export type RunWithSteps = Run & { steps: RunStep[] };

type Outcome<T = object> = ({ ok: true } & T) | { ok: false; reason: "not_found" };

const runColumns = {
  id: procedureRuns.id,
  bikeId: procedureRuns.bikeId,
  procedureId: procedureRuns.procedureId,
  taskId: procedureRuns.taskId,
  ruleId: procedureRuns.ruleId,
  title: procedureRuns.title,
  status: procedureRuns.status,
  startedAt: procedureRuns.startedAt,
  finishedAt: procedureRuns.finishedAt,
  maintenanceEventId: procedureRuns.maintenanceEventId,
};

function toRun(row: {
  id: number;
  bikeId: number | null;
  procedureId: number | null;
  taskId: number | null;
  ruleId: number | null;
  title: string;
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  maintenanceEventId: number | null;
}): Run {
  return {
    ...row,
    startedAt: row.startedAt.getTime(),
    finishedAt: row.finishedAt?.getTime() ?? null,
  };
}

function ownedRun(tx: Tx, ctx: AccessContext, runId: number): Run | null {
  const row = tx
    .select(runColumns)
    .from(procedureRuns)
    .where(and(eq(procedureRuns.id, runId), eq(procedureRuns.workspaceId, ctx.workspace.id)))
    .get();
  return row ? toRun(row) : null;
}

/** The step and its run, if the run belongs to the workspace and is still in progress. */
function stepInProgress(tx: Tx, ctx: AccessContext, stepId: number) {
  return tx
    .select({ id: procedureRunSteps.id, runId: procedureRunSteps.runId })
    .from(procedureRunSteps)
    .innerJoin(procedureRuns, eq(procedureRuns.id, procedureRunSteps.runId))
    .where(
      and(
        eq(procedureRunSteps.id, stepId),
        eq(procedureRuns.workspaceId, ctx.workspace.id),
        eq(procedureRuns.status, "in_progress"),
      ),
    )
    .get();
}

function stepsOf(tx: Tx, runId: number): RunStep[] {
  const steps = tx
    .select()
    .from(procedureRunSteps)
    .where(eq(procedureRunSteps.runId, runId))
    .orderBy(asc(procedureRunSteps.sortOrder), asc(procedureRunSteps.id))
    .all();
  const photos = new Map(
    steps.length
      ? tx
          .select({ stepId: attachments.procedureRunStepId, n: count() })
          .from(attachments)
          .where(
            inArray(
              attachments.procedureRunStepId,
              steps.map((step) => step.id),
            ),
          )
          .groupBy(attachments.procedureRunStepId)
          .all()
          .map((row) => [row.stepId, row.n])
      : [],
  );
  return steps.map((step) => ({
    id: step.id,
    procedureStepId: step.procedureStepId,
    instruction: step.instruction,
    note: step.note,
    torqueNm: step.torqueNm,
    doneAt: step.doneAt?.getTime() ?? null,
    comment: step.comment,
    photoCount: photos.get(step.id) ?? 0,
  }));
}

/** A run of the workspace with its steps, in order. */
export function getRun(ctx: AccessContext, runId: number): RunWithSteps | null {
  return getDb().transaction((tx) => {
    const run = ownedRun(tx, ctx, runId);
    return run ? { ...run, steps: stepsOf(tx, run.id) } : null;
  });
}

/** A run in progress, with its progress: "En cours" in "À prévoir" (D-87). */
export type RunInProgress = Run & { stepCount: number; doneCount: number };

/** The runs in progress of the workspace, oldest first. */
export function listRunsInProgress(ctx: AccessContext): RunInProgress[] {
  const db = getDb();
  const runs = db
    .select(runColumns)
    .from(procedureRuns)
    .where(
      and(eq(procedureRuns.workspaceId, ctx.workspace.id), eq(procedureRuns.status, "in_progress")),
    )
    .orderBy(asc(procedureRuns.startedAt))
    .all()
    .map(toRun);
  if (!runs.length) return [];
  const steps = db
    .select({ runId: procedureRunSteps.runId, doneAt: procedureRunSteps.doneAt })
    .from(procedureRunSteps)
    .where(
      inArray(
        procedureRunSteps.runId,
        runs.map((run) => run.id),
      ),
    )
    .all();
  return runs.map((run) => {
    const own = steps.filter((step) => step.runId === run.id);
    return {
      ...run,
      stepCount: own.length,
      doneCount: own.filter((step) => step.doneAt != null).length,
    };
  });
}

/** The runs of some tasks, newest first: "Voir le suivi" on a done task (D-87). */
export function listRunsOfTasks(ctx: AccessContext, taskIds: number[]): Run[] {
  if (!taskIds.length) return [];
  return getDb()
    .select(runColumns)
    .from(procedureRuns)
    .where(
      and(eq(procedureRuns.workspaceId, ctx.workspace.id), inArray(procedureRuns.taskId, taskIds)),
    )
    .orderBy(desc(procedureRuns.startedAt))
    .all()
    .map(toRun);
}

/** The runs done of some events: their photos show on those events (D-87). */
export function listRunsOfEvents(ctx: AccessContext, eventIds: number[]): Run[] {
  if (!eventIds.length) return [];
  return getDb()
    .select(runColumns)
    .from(procedureRuns)
    .where(
      and(
        eq(procedureRuns.workspaceId, ctx.workspace.id),
        inArray(procedureRuns.maintenanceEventId, eventIds),
      ),
    )
    .all()
    .map(toRun);
}

export type StartRunInput =
  | { from: "task"; taskId: number }
  | { from: "rule"; ruleId: number }
  | { from: "procedure"; procedureId: number; bikeId: number };

/**
 * "Commencer" (D-87): a run of a task (its procedure, if any; its bike, or none for a general
 * task), of a rule with a procedure, or of a procedure for a bike. One run in progress per task,
 * per rule, per procedure and bike: an existing one is resumed. The procedure's steps are copied.
 */
export function startRun(
  ctx: AccessContext,
  input: StartRunInput,
  at: number,
): Outcome<{ runId: number; resumed: boolean }> {
  return getDb().transaction((tx) => {
    const ws = ctx.workspace.id;
    let context: {
      bikeId: number | null;
      procedureId: number | null;
      taskId: number | null;
      ruleId: number | null;
      title: string;
    };
    if (input.from === "task") {
      const task = tx
        .select({ bikeId: tasks.bikeId, procedureId: tasks.procedureId, title: tasks.title })
        .from(tasks)
        .where(and(eq(tasks.id, input.taskId), eq(tasks.workspaceId, ws), eq(tasks.status, "open")))
        .get();
      if (!task) return { ok: false, reason: "not_found" };
      context = { ...task, taskId: input.taskId, ruleId: null };
    } else if (input.from === "rule") {
      const rule = tx
        .select({ bikeId: maintenanceRules.bikeId, procedureId: maintenanceRules.procedureId })
        .from(maintenanceRules)
        .innerJoin(bikes, eq(bikes.id, maintenanceRules.bikeId))
        .where(and(eq(maintenanceRules.id, input.ruleId), eq(bikes.workspaceId, ws)))
        .get();
      if (!rule || rule.procedureId == null) return { ok: false, reason: "not_found" };
      context = { ...rule, taskId: null, ruleId: input.ruleId, title: "" };
    } else {
      const bike = tx
        .select({ id: bikes.id })
        .from(bikes)
        .where(and(eq(bikes.id, input.bikeId), eq(bikes.workspaceId, ws)))
        .get();
      if (!bike) return { ok: false, reason: "not_found" };
      context = {
        bikeId: input.bikeId,
        procedureId: input.procedureId,
        taskId: null,
        ruleId: null,
        title: "",
      };
    }
    const procedure =
      context.procedureId == null
        ? null
        : tx
            .select({ id: procedures.id, title: procedures.title })
            .from(procedures)
            .where(and(eq(procedures.id, context.procedureId), eq(procedures.workspaceId, ws)))
            .get();
    if (context.procedureId != null && !procedure) return { ok: false, reason: "not_found" };

    // One run in progress per task, per rule, per procedure and bike.
    const existing = tx
      .select({ id: procedureRuns.id })
      .from(procedureRuns)
      .where(
        and(
          eq(procedureRuns.workspaceId, ws),
          eq(procedureRuns.status, "in_progress"),
          context.taskId != null
            ? eq(procedureRuns.taskId, context.taskId)
            : context.ruleId != null
              ? eq(procedureRuns.ruleId, context.ruleId)
              : and(
                  eq(procedureRuns.procedureId, context.procedureId!),
                  eq(procedureRuns.bikeId, context.bikeId!),
                  isNull(procedureRuns.taskId),
                  isNull(procedureRuns.ruleId),
                ),
        ),
      )
      .get();
    if (existing) return { ok: true, runId: existing.id, resumed: true };

    const { id: runId } = tx
      .insert(procedureRuns)
      .values({
        workspaceId: ws,
        bikeId: context.bikeId,
        procedureId: context.procedureId,
        taskId: context.taskId,
        ruleId: context.ruleId,
        title: procedure?.title ?? context.title,
        status: "in_progress",
        startedAt: new Date(at),
      })
      .returning({ id: procedureRuns.id })
      .get();
    if (procedure) {
      const steps = tx
        .select()
        .from(procedureSteps)
        .where(eq(procedureSteps.procedureId, procedure.id))
        .orderBy(asc(procedureSteps.sortOrder), asc(procedureSteps.id))
        .all();
      steps.forEach((step, sortOrder) => {
        tx.insert(procedureRunSteps)
          .values({
            runId,
            procedureStepId: step.id,
            sortOrder,
            instruction: step.instruction,
            note: step.note,
            torqueNm: step.torqueNm,
          })
          .run();
      });
    }
    return { ok: true, runId, resumed: false };
  });
}

/** "Étape faite" and a step's comment, while the run is in progress. */
export function updateRunStep(
  ctx: AccessContext,
  stepId: number,
  patch: { done?: boolean; comment?: string | null },
  at: number,
): Outcome {
  return getDb().transaction((tx) => {
    if (!stepInProgress(tx, ctx, stepId)) return { ok: false, reason: "not_found" };
    tx.update(procedureRunSteps)
      .set({
        ...(patch.done === undefined ? {} : { doneAt: patch.done ? new Date(at) : null }),
        ...(patch.comment === undefined ? {} : { comment: patch.comment }),
      })
      .where(eq(procedureRunSteps.id, stepId))
      .run();
    return { ok: true };
  });
}

/** A step added along the way, at the end (D-82). */
export function addRunStep(
  ctx: AccessContext,
  runId: number,
  instruction: string,
): Outcome<{ stepId: number }> {
  return getDb().transaction((tx) => {
    const run = ownedRun(tx, ctx, runId);
    if (!run || run.status !== "in_progress") return { ok: false, reason: "not_found" };
    const last = tx
      .select({ sortOrder: procedureRunSteps.sortOrder })
      .from(procedureRunSteps)
      .where(eq(procedureRunSteps.runId, runId))
      .orderBy(asc(procedureRunSteps.sortOrder))
      .all()
      .at(-1);
    const { id } = tx
      .insert(procedureRunSteps)
      .values({ runId, sortOrder: (last?.sortOrder ?? -1) + 1, instruction })
      .returning({ id: procedureRunSteps.id })
      .get();
    return { ok: true, stepId: id };
  });
}

/** Removes a step of a run in progress, its photos with it (the screen asks first). */
export function removeRunStep(ctx: AccessContext, stepId: number): Outcome {
  return withFileCleanup(runStepAttachmentPaths([stepId]), () =>
    getDb().transaction((tx): Outcome => {
      if (!stepInProgress(tx, ctx, stepId)) return { ok: false, reason: "not_found" };
      tx.delete(procedureRunSteps).where(eq(procedureRunSteps.id, stepId)).run();
      return { ok: true };
    }),
  );
}

/** "Abandonner le suivi" (D-82): the run goes, its photos with it, once confirmed. */
export function abandonRun(ctx: AccessContext, runId: number): Outcome {
  return withFileCleanup(runAttachmentPaths(runId), () =>
    getDb().transaction((tx): Outcome => {
      const run = ownedRun(tx, ctx, runId);
      if (!run || run.status !== "in_progress") return { ok: false, reason: "not_found" };
      tx.delete(procedureRuns).where(eq(procedureRuns.id, runId)).run();
      return { ok: true };
    }),
  );
}

export type FinishRunData = {
  /** When it is recorded: `created_at` of the event, `done_at` of the task (D-61). */
  at: number;
  performedOn: LocalDate;
  title: string;
  notes: string | null;
  laborTimeS: number | null;
  /** The event's line; null for a general task's run (no event). */
  line: {
    action: Exclude<MaintenanceAction, "replaced">;
    componentId: number | null;
    ruleId: number | null;
    costCents: number | null;
  } | null;
  /** An event of the same bike and day to join (a replacement made from the summary, D-63). */
  joinEventId: number | null;
  /** Parts taken out of the stock, in units. */
  parts: { itemId: number; quantity: number }[];
  /** Products' open container after the job (one level down by default, D-47). */
  products: { itemId: number; levelAfter: ProductLevel }[];
  /** A run without procedure: its steps become a new procedure (D-87). */
  saveAsProcedure: boolean;
};

/** What "Annuler" after "Terminer" needs (D-60). */
export type FinishUndo = {
  runId: number;
  eventId: number | null;
  lineId: number | null;
  eventCreated: boolean;
  previousEvent: { notes: string | null; laborTimeS: number | null } | null;
  previousTask: { status: TaskStatus; doneAt: number | null } | null;
  procedureId: number | null;
};

export type FinishOutcome =
  ({ ok: true } & FinishUndo) | { ok: false; reason: "not_found" | "invalid" | "stock" };

/**
 * "Terminer" (D-82, D-87), in one transaction: the maintenance event (or a line added to the
 * event a replacement made that day), the parts and product levels taken from the workshop
 * (linked to that line), the task done, the run done. A general task's run writes no event.
 */
export function finishRun(ctx: AccessContext, runId: number, data: FinishRunData): FinishOutcome {
  return getDb().transaction((tx): FinishOutcome => {
    const run = ownedRun(tx, ctx, runId);
    if (!run || run.status !== "in_progress") return { ok: false, reason: "not_found" };
    const at = new Date(data.at);
    let eventId: number | null = null;
    let lineId: number | null = null;
    let eventCreated = false;
    let previousEvent: FinishUndo["previousEvent"] = null;

    if (run.bikeId != null) {
      const line = data.line;
      if (!line) return { ok: false, reason: "invalid" };
      if (
        checkLines(tx, run.bikeId, [
          { ...line, description: null, measurementValue: null, measurementUnit: null },
        ])
      ) {
        return { ok: false, reason: "invalid" };
      }

      // Everything is checked before the first write: a refusal leaves nothing behind.
      const itemIds = [...new Set([...data.parts, ...data.products].map((entry) => entry.itemId))];
      const items = itemIds.length
        ? tx
            .select({ id: inventoryItems.id, kind: inventoryItems.kind })
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.workspaceId, ctx.workspace.id),
                inArray(inventoryItems.id, itemIds),
              ),
            )
            .all()
        : [];
      const movementsOf = (itemId: number) =>
        tx
          .select({
            id: inventoryMovements.id,
            occurredAt: inventoryMovements.occurredAt,
            quantityDelta: inventoryMovements.quantityDelta,
            levelAfter: inventoryMovements.levelAfter,
          })
          .from(inventoryMovements)
          .where(eq(inventoryMovements.itemId, itemId))
          .all()
          .map((m) => ({ ...m, occurredAt: m.occurredAt.getTime() }));
      const uses: { itemId: number; change: StockChange }[] = [];
      for (const part of data.parts) {
        if (part.quantity <= 0) continue;
        const item = items.find((i) => i.id === part.itemId);
        if (!item || item.kind !== "part") return { ok: false, reason: "invalid" };
        if (stockQuantity(movementsOf(part.itemId)) < part.quantity) {
          return { ok: false, reason: "stock" };
        }
        uses.push({
          itemId: part.itemId,
          change: { kind: "use", quantityDelta: -part.quantity, levelAfter: null },
        });
      }
      for (const product of data.products) {
        const item = items.find((i) => i.id === product.itemId);
        if (!item || item.kind !== "product") return { ok: false, reason: "invalid" };
        const change = levelChange(productStock(movementsOf(product.itemId)), product.levelAfter);
        if (change) uses.push({ itemId: product.itemId, change });
      }
      const joined =
        data.joinEventId == null
          ? null
          : tx
              .select({
                id: maintenanceEvents.id,
                notes: maintenanceEvents.notes,
                laborTimeS: maintenanceEvents.laborTimeS,
              })
              .from(maintenanceEvents)
              .where(
                and(
                  eq(maintenanceEvents.id, data.joinEventId),
                  eq(maintenanceEvents.bikeId, run.bikeId),
                  eq(maintenanceEvents.performedOn, data.performedOn),
                ),
              )
              .get();

      if (joined) {
        eventId = joined.id;
        previousEvent = { notes: joined.notes, laborTimeS: joined.laborTimeS };
        tx.update(maintenanceEvents)
          .set({
            notes: [joined.notes, data.notes].filter(Boolean).join("\n\n") || null,
            laborTimeS:
              data.laborTimeS == null
                ? joined.laborTimeS
                : (joined.laborTimeS ?? 0) + data.laborTimeS,
          })
          .where(eq(maintenanceEvents.id, joined.id))
          .run();
      } else {
        eventCreated = true;
        eventId = tx
          .insert(maintenanceEvents)
          .values({
            bikeId: run.bikeId,
            performedOn: data.performedOn,
            title: data.title,
            performedBy: "self",
            createdBy: ctx.user.id,
            notes: data.notes,
            laborTimeS: data.laborTimeS,
            createdAt: at,
          })
          .returning({ id: maintenanceEvents.id })
          .get().id;
      }
      lineId = tx
        .insert(maintenanceItems)
        .values({
          eventId,
          action: line.action,
          componentId: line.componentId,
          ruleId: line.ruleId,
          costCents: line.costCents,
          description: run.procedureId == null ? null : `Fiche suivie : ${run.title}`,
        })
        .returning({ id: maintenanceItems.id })
        .get().id;
      // The workshop: parts out, products one level down (or as chosen), linked to the line.
      for (const use of uses) {
        tx.insert(inventoryMovements)
          .values({
            itemId: use.itemId,
            occurredAt: at,
            ...use.change,
            maintenanceItemId: lineId,
            createdBy: ctx.user.id,
            note: data.title,
          })
          .run();
      }
    }

    // The task is done, at the instant "Terminer" was pressed (D-77).
    let previousTask: FinishUndo["previousTask"] = null;
    if (run.taskId != null) {
      const task = tx
        .select({ status: tasks.status, doneAt: tasks.doneAt })
        .from(tasks)
        .where(eq(tasks.id, run.taskId))
        .get();
      if (task) {
        previousTask = { status: task.status, doneAt: task.doneAt?.getTime() ?? null };
        tx.update(tasks).set({ status: "done", doneAt: at }).where(eq(tasks.id, run.taskId)).run();
      }
    }

    // A run without procedure can leave its steps as a new one (D-87).
    let procedureId: number | null = null;
    if (data.saveAsProcedure && run.procedureId == null) {
      procedureId = tx
        .insert(procedures)
        .values({ workspaceId: ctx.workspace.id, title: data.title })
        .returning({ id: procedures.id })
        .get().id;
      if (run.bikeId != null) {
        tx.insert(procedureBikes).values({ procedureId, bikeId: run.bikeId }).run();
      }
      stepsOf(tx, run.id).forEach((step, sortOrder) => {
        tx.insert(procedureSteps)
          .values({
            procedureId: procedureId!,
            sortOrder,
            instruction: step.instruction,
            note: step.note,
            torqueNm: step.torqueNm,
          })
          .run();
      });
    }

    tx.update(procedureRuns)
      .set({
        status: "done",
        finishedAt: at,
        maintenanceEventId: eventId,
        ...(procedureId == null ? {} : { procedureId }),
      })
      .where(eq(procedureRuns.id, run.id))
      .run();
    return {
      ok: true,
      runId: run.id,
      eventId,
      lineId,
      eventCreated,
      previousEvent,
      previousTask,
      procedureId,
    };
  });
}

/**
 * "Annuler" after "Terminer" (D-60): the line and what it took from the workshop go, the event
 * too when "Terminer" created it, the task and the run are back as they were. Refused
 * (`too_late`) once another line joined an event it created.
 */
export function undoFinishRun(
  ctx: AccessContext,
  undo: FinishUndo,
): { ok: true } | { ok: false; reason: "not_found" | "too_late" } {
  return getDb().transaction((tx) => {
    const run = ownedRun(tx, ctx, undo.runId);
    if (!run || run.status !== "done" || run.maintenanceEventId !== undo.eventId) {
      return { ok: false, reason: "not_found" };
    }
    // The token comes back from the browser: its line must be on the run's event and its
    // procedure the one the run saved, or a forged token could delete another line (D-25).
    if ((undo.eventId == null) !== (undo.lineId == null)) {
      return { ok: false, reason: "not_found" };
    }
    if (undo.eventId != null && undo.lineId != null) {
      const line = tx
        .select({ id: maintenanceItems.id })
        .from(maintenanceItems)
        .where(
          and(eq(maintenanceItems.id, undo.lineId), eq(maintenanceItems.eventId, undo.eventId)),
        )
        .get();
      if (!line) return { ok: false, reason: "not_found" };
    }
    if (undo.procedureId != null && run.procedureId !== undo.procedureId) {
      return { ok: false, reason: "not_found" };
    }
    if (undo.eventId != null && undo.lineId != null) {
      if (undo.eventCreated) {
        const others = tx
          .select({ id: maintenanceItems.id })
          .from(maintenanceItems)
          .where(
            and(eq(maintenanceItems.eventId, undo.eventId), ne(maintenanceItems.id, undo.lineId)),
          )
          .get();
        if (others) return { ok: false, reason: "too_late" };
      }
      // The run first: deleting its event would delete it (cascade).
      tx.update(procedureRuns)
        .set({ status: "in_progress", finishedAt: null, maintenanceEventId: null })
        .where(eq(procedureRuns.id, run.id))
        .run();
      tx.delete(inventoryMovements)
        .where(eq(inventoryMovements.maintenanceItemId, undo.lineId))
        .run();
      tx.delete(maintenanceItems).where(eq(maintenanceItems.id, undo.lineId)).run();
      if (undo.eventCreated) {
        tx.delete(maintenanceEvents).where(eq(maintenanceEvents.id, undo.eventId)).run();
      } else if (undo.previousEvent) {
        tx.update(maintenanceEvents)
          .set(undo.previousEvent)
          .where(eq(maintenanceEvents.id, undo.eventId))
          .run();
      }
    } else {
      tx.update(procedureRuns)
        .set({ status: "in_progress", finishedAt: null })
        .where(eq(procedureRuns.id, run.id))
        .run();
    }
    if (run.taskId != null && undo.previousTask) {
      tx.update(tasks)
        .set({
          status: undo.previousTask.status,
          doneAt: undo.previousTask.doneAt == null ? null : new Date(undo.previousTask.doneAt),
        })
        .where(eq(tasks.id, run.taskId))
        .run();
    }
    if (undo.procedureId != null) {
      tx.update(procedureRuns).set({ procedureId: null }).where(eq(procedureRuns.id, run.id)).run();
      tx.delete(procedures)
        .where(
          and(eq(procedures.id, undo.procedureId), eq(procedures.workspaceId, ctx.workspace.id)),
        )
        .run();
    }
    return { ok: true };
  });
}
