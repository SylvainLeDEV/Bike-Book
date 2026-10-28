import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import type { TaskStatus } from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import type { AccessContext } from "./access-context";
import { getDb, type Tx } from "./client";
import { bikes, tasks } from "./schema";

// One-off tasks of the workspace (feature 7, D-34).

export type Task = {
  id: number;
  bikeId: number | null;
  title: string;
  dueOn: LocalDate | null;
  status: TaskStatus;
  doneAt: number | null;
  notes: string | null;
};

export type TaskData = {
  bikeId: number | null;
  title: string;
  dueOn: LocalDate | null;
  notes: string | null;
};

const taskColumns = {
  id: tasks.id,
  bikeId: tasks.bikeId,
  title: tasks.title,
  dueOn: tasks.dueOn,
  status: tasks.status,
  doneAt: tasks.doneAt,
  notes: tasks.notes,
};

/** Open tasks of the workspace (one bike's when `bikeId` is given): by due date, undated last. */
export function listOpenTasks(ctx: AccessContext, bikeId?: number): Task[] {
  return getDb()
    .select(taskColumns)
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, ctx.workspace.id),
        eq(tasks.status, "open"),
        bikeId == null ? undefined : eq(tasks.bikeId, bikeId),
      ),
    )
    .orderBy(asc(tasks.id))
    .all()
    .map((row) => ({ ...row, doneAt: row.doneAt?.getTime() ?? null }))
    .sort((a, b) =>
      a.dueOn === b.dueOn
        ? a.id - b.id
        : a.dueOn == null
          ? 1
          : b.dueOn == null
            ? -1
            : a.dueOn < b.dueOn
              ? -1
              : 1,
    );
}

/**
 * Done tasks of the workspace (one bike's when `bikeId` is given), last done first: the history
 * shows them at `done_at` (D-77). Cancelled tasks are left out.
 */
export function listDoneTasks(
  ctx: AccessContext,
  options: { bikeId?: number; limit?: number } = {},
): (Task & { doneAt: number })[] {
  const query = getDb()
    .select(taskColumns)
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, ctx.workspace.id),
        eq(tasks.status, "done"),
        options.bikeId == null ? undefined : eq(tasks.bikeId, options.bikeId),
      ),
    )
    .orderBy(desc(tasks.doneAt), desc(tasks.id));
  const rows = options.limit == null ? query.all() : query.limit(options.limit).all();
  // done_at is set exactly when the task is done (CHECK).
  return rows.map((row) => ({ ...row, doneAt: row.doneAt?.getTime() ?? 0 }));
}

/** The bike is none, or one of the workspace. */
function ownsBike(tx: Tx, ctx: AccessContext, bikeId: number | null): boolean {
  return (
    bikeId == null ||
    tx
      .select({ id: bikes.id })
      .from(bikes)
      .where(and(eq(bikes.id, bikeId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get() != null
  );
}

/** Adds a task; its bike, if any, must belong to the workspace. */
export function createTask(
  ctx: AccessContext,
  data: TaskData,
): { ok: true; taskId: number } | { ok: false; reason: "not_found" } {
  return getDb().transaction((tx) => {
    if (!ownsBike(tx, ctx, data.bikeId)) return { ok: false, reason: "not_found" };
    const { id } = tx
      .insert(tasks)
      .values({ ...data, workspaceId: ctx.workspace.id })
      .returning({ id: tasks.id })
      .get();
    return { ok: true, taskId: id };
  });
}

/**
 * Marks a task done at `at`, or open again ("Fait", "Rouvrir la tâche" and their "Annuler",
 * D-60, D-77). Returns the previous status and done instant, which an "Annuler" restores.
 */
export function setTaskStatus(
  ctx: AccessContext,
  taskId: number,
  status: "open" | "done",
  at: number,
):
  | { ok: true; previous: TaskStatus; previousDoneAt: number | null }
  | { ok: false; reason: "not_found" } {
  return getDb().transaction((tx) => {
    const task = tx
      .select({ status: tasks.status, doneAt: tasks.doneAt })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ctx.workspace.id)))
      .get();
    if (!task) return { ok: false, reason: "not_found" };
    tx.update(tasks)
      .set({ status, doneAt: status === "done" ? new Date(at) : null })
      .where(eq(tasks.id, taskId))
      .run();
    return { ok: true, previous: task.status, previousDoneAt: task.doneAt?.getTime() ?? null };
  });
}

/**
 * "Modifier la tâche" (feature 10, where a task's attachments live): title, bike, due date and
 * notes. Its attachments follow it to another bike.
 */
export function updateTask(
  ctx: AccessContext,
  taskId: number,
  data: TaskData,
): { ok: true } | { ok: false; reason: "not_found" } {
  return getDb().transaction((tx) => {
    const task = tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ctx.workspace.id)))
      .get();
    if (!task || !ownsBike(tx, ctx, data.bikeId)) return { ok: false, reason: "not_found" };
    tx.update(tasks).set(data).where(eq(tasks.id, taskId)).run();
    return { ok: true };
  });
}
