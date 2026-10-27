"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { isLocalDate } from "@/lib/format";
import { cleanName } from "@/lib/names";
import type { TaskInput } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import { createTask, setTaskStatus } from "@/server/db";

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

/** "Fait" on a task, and its "Annuler" (D-60). */
export async function setTaskDoneAction(
  taskId: unknown,
  done: unknown,
): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireAccessContext();
  const parsed = z.object({ taskId: id, done: z.boolean() }).safeParse({ taskId, done });
  if (!parsed.success) return { ok: false, message: "Tâche introuvable." };
  const outcome = setTaskStatus(
    ctx,
    parsed.data.taskId,
    parsed.data.done ? "done" : "open",
    Date.now(),
  );
  if (!outcome.ok) return { ok: false, message: "Tâche introuvable." };
  refresh();
  return { ok: true, message: parsed.data.done ? "Tâche faite" : "Tâche rouverte" };
}
