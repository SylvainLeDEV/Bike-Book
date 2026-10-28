"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { isLocalDate } from "@/lib/format";
import { cleanName } from "@/lib/names";
import type { TaskInput } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import { createTask, setTaskStatus, updateTask } from "@/server/db";

const taskSchema = z.object({
  bikeId: z.number().int().positive().nullable(),
  title: z
    .string()
    .transform(cleanName)
    .pipe(z.string().min(1, "Donne un titre à la tâche.").max(120, "120 caractères au maximum.")),
  dueOn: z.string().refine(isLocalDate, "Date invalide.").nullable(),
  notes: z
    .string()
    .trim()
    .max(2000, "2000 caractères au maximum.")
    .nullable()
    .transform((value) => value || null),
}) satisfies z.ZodType<TaskInput, unknown>;

/** "Nouvelle tâche" (D-34). */
export async function createTaskAction(
  input: unknown,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  if (!createTask(ctx, parsed.data).ok) return { ok: false, error: "Vélo introuvable." };
  refresh();
  return { ok: true, message: `Tâche ajoutée : ${parsed.data.title}` };
}

const id = z.number().int().positive();

/** "Modifier la tâche": the same fields as "Nouvelle tâche". */
export async function updateTaskAction(
  taskId: unknown,
  input: unknown,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsedId = id.safeParse(taskId);
  const parsed = taskSchema.safeParse(input);
  if (!parsedId.success) return { ok: false, error: "Tâche introuvable." };
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  if (!updateTask(ctx, parsedId.data, parsed.data).ok) {
    return { ok: false, error: "Tâche ou vélo introuvable." };
  }
  refresh();
  return { ok: true, message: "Tâche modifiée" };
}

/**
 * "Fait" on a task, "Rouvrir la tâche" (D-77), and their "Annuler" (D-60). `doneAt` is only given
 * by the "Annuler" of a reopening: the task is done again at the instant it had, not now.
 * Reopening answers with that instant (`undoDoneAt`).
 */
export async function setTaskDoneAction(
  taskId: unknown,
  done: unknown,
  doneAt?: unknown,
): Promise<{ ok: boolean; message: string; undoDoneAt?: number }> {
  const ctx = await requireAccessContext();
  const now = Date.now();
  const parsed = z
    .object({ taskId: id, done: z.boolean(), doneAt: z.number().int().min(0).max(now).optional() })
    .safeParse({ taskId, done, doneAt });
  if (!parsed.success) return { ok: false, message: "Tâche introuvable." };
  const outcome = setTaskStatus(
    ctx,
    parsed.data.taskId,
    parsed.data.done ? "done" : "open",
    parsed.data.done ? (parsed.data.doneAt ?? now) : now,
  );
  if (!outcome.ok) return { ok: false, message: "Tâche introuvable." };
  refresh();
  if (parsed.data.done) return { ok: true, message: "Tâche faite" };
  return {
    ok: true,
    message: "Tâche rouverte",
    ...(outcome.previousDoneAt == null ? {} : { undoDoneAt: outcome.previousDoneAt }),
  };
}
