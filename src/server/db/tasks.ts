import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { TaskStatus } from "@/lib/enums";
import type { LocalDate } from "@/lib/format";
import type { AccessContext } from "./access-context";
import { getDb } from "./client";
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

/** Open tasks of the workspace (one bike's when `bikeId` is given): by due date, undated last. */
export function listOpenTasks(ctx: AccessContext, bikeId?: number): Task[] {
  return getDb()
    .select({
      id: tasks.id,
      bikeId: tasks.bikeId,
      title: tasks.title,
      dueOn: tasks.dueOn,
      status: tasks.status,
      doneAt: tasks.doneAt,
      notes: tasks.notes,
    })
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

/** Adds a task; its bike, if any, must belong to the workspace. */
export function createTask(
  ctx: AccessContext,
  data: TaskData,
): { ok: true; taskId: number } | { ok: false; reason: "not_found" } {
  return getDb().transaction((tx) => {
    if (
      data.bikeId != null &&
      !tx
        .select({ id: bikes.id })
        .from(bikes)
        .where(and(eq(bikes.id, data.bikeId), eq(bikes.workspaceId, ctx.workspace.id)))
        .get()
    ) {
      return { ok: false, reason: "not_found" };
    }
    const { id } = tx
      .insert(tasks)
      .values({ ...data, workspaceId: ctx.workspace.id })
      .returning({ id: tasks.id })
      .get();
    return { ok: true, taskId: id };
  });
}

/**
 * Marks a task done or open again ("Fait", and its "Annuler", D-60). Returns the previous status.
 */
export function setTaskStatus(
  ctx: AccessContext,
  taskId: number,
  status: "open" | "done",
  at: number,
): { ok: true; previous: TaskStatus } | { ok: false; reason: "not_found" } {
  return getDb().transaction((tx) => {
    const task = tx
      .select({ status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ctx.workspace.id)))
      .get();
    if (!task) return { ok: false, reason: "not_found" };
    tx.update(tasks)
      .set({ status, doneAt: status === "done" ? new Date(at) : null })
      .where(eq(tasks.id, taskId))
      .run();
    return { ok: true, previous: task.status };
  });
}
