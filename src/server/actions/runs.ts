"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAccessContext } from "@/server/auth/context";
import {
  abandonRun,
  addRunStep,
  finishRun,
  getRun,
  removeRunStep,
  startRun,
  undoFinishRun,
  updateRunStep,
  type FinishUndo,
} from "@/server/db";
import { today } from "@/server/time";
import { parseFinishRun, runId, stepInstruction, stepPatchSchema } from "./run-input";

// Runs ("suivi", D-82, D-87): "Commencer", the steps (checked, commented, added along the way),
// "Abandonner" (confirmed on the screen), "Terminer" with its "Annuler" (D-60).

const NOT_FOUND = { ok: false, error: "Suivi introuvable." } as const;

const startSchema = z.discriminatedUnion("from", [
  z.object({ from: z.literal("task"), taskId: runId }),
  z.object({ from: z.literal("rule"), ruleId: runId }),
  z.object({ from: z.literal("procedure"), procedureId: runId, bikeId: runId }),
]);

/** "Commencer" (or "Reprendre": a run in progress for the same task, rule or bike is resumed). */
export async function startRunAction(
  input: unknown,
): Promise<{ ok: true; runId: number } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return NOT_FOUND;
  const outcome = startRun(ctx, parsed.data, Date.now());
  if (!outcome.ok) return { ok: false, error: "Tâche, règle ou fiche introuvable." };
  refresh();
  return { ok: true, runId: outcome.runId };
}

/** "Étape faite" and a step's comment. */
export async function updateRunStepAction(
  stepId: unknown,
  patch: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsedId = runId.safeParse(stepId);
  const parsed = stepPatchSchema.safeParse(patch);
  if (!parsedId.success || !parsed.success) return { ok: false, error: "Étape introuvable." };
  if (!updateRunStep(ctx, parsedId.data, parsed.data, Date.now()).ok) {
    return { ok: false, error: "Étape introuvable : le suivi est peut-être terminé." };
  }
  refresh();
  return { ok: true };
}

/** "Ajouter une étape" along the way (D-82). */
export async function addRunStepAction(
  id: unknown,
  instruction: unknown,
): Promise<{ ok: true; stepId: number } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsedId = runId.safeParse(id);
  const parsed = stepInstruction.safeParse(instruction);
  if (!parsedId.success) return NOT_FOUND;
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const outcome = addRunStep(ctx, parsedId.data, parsed.data);
  if (!outcome.ok) return NOT_FOUND;
  refresh();
  return { ok: true, stepId: outcome.stepId };
}

/** Removes a step added along the way, its photos with it (asked first on the screen). */
export async function removeRunStepAction(
  stepId: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsed = runId.safeParse(stepId);
  if (!parsed.success || !removeRunStep(ctx, parsed.data).ok) {
    return { ok: false, error: "Étape introuvable." };
  }
  refresh();
  return { ok: true };
}

/** "Abandonner le suivi", once confirmed: the run and its photos go (D-82). */
export async function abandonRunAction(
  id: unknown,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsed = runId.safeParse(id);
  if (!parsed.success) return NOT_FOUND;
  const title = getRun(ctx, parsed.data)?.title;
  if (!title || !abandonRun(ctx, parsed.data).ok) return NOT_FOUND;
  refresh();
  return { ok: true, message: `Suivi abandonné : ${title}` };
}

/** "Enregistrer l'entretien" from the summary (D-82, D-87). */
export async function finishRunAction(
  id: unknown,
  input: unknown,
): Promise<
  | { ok: true; message: string; undo: FinishUndo; bikeId: number | null }
  | { ok: false; error: string }
> {
  const ctx = await requireAccessContext();
  const parsedId = runId.safeParse(id);
  if (!parsedId.success) return NOT_FOUND;
  const run = getRun(ctx, parsedId.data);
  if (!run || run.status !== "in_progress") return NOT_FOUND;
  const parsed = parseFinishRun(input, today(), run.bikeId != null, Date.now());
  if (!parsed.ok) return parsed;
  const outcome = finishRun(ctx, run.id, parsed.data);
  if (!outcome.ok) {
    const errors = {
      not_found: NOT_FOUND.error,
      invalid: "Pièce, règle ou objet de l'atelier introuvable.",
      stock: "Il n'y a pas assez de stock pour une des pièces : baisse la quantité.",
    };
    return { ok: false, error: errors[outcome.reason] };
  }
  refresh();
  const undo: FinishUndo = {
    runId: outcome.runId,
    eventId: outcome.eventId,
    lineId: outcome.lineId,
    eventCreated: outcome.eventCreated,
    previousEvent: outcome.previousEvent,
    previousTask: outcome.previousTask,
    procedureId: outcome.procedureId,
  };
  return {
    ok: true,
    message:
      run.bikeId == null
        ? `Tâche faite : ${parsed.data.title}`
        : `Entretien enregistré : ${parsed.data.title}`,
    undo,
    bikeId: run.bikeId,
  };
}

const undoSchema = z.object({
  runId,
  eventId: runId.nullable(),
  lineId: runId.nullable(),
  eventCreated: z.boolean(),
  previousEvent: z
    .object({
      notes: z.string().nullable(),
      laborTimeS: z.number().int().positive().nullable(),
    })
    .nullable(),
  previousTask: z
    .object({
      status: z.enum(["open", "done", "cancelled"]),
      doneAt: z.number().int().min(0).nullable(),
    })
    .nullable(),
  procedureId: runId.nullable(),
});

/** "Annuler" after "Terminer" (D-60): the run is back in progress, nothing of it written. */
export async function undoFinishRunAction(token: unknown): Promise<{ message: string }> {
  const ctx = await requireAccessContext();
  const parsed = undoSchema.safeParse(token);
  if (!parsed.success) return { message: "Rien à annuler." };
  const outcome = undoFinishRun(ctx, parsed.data);
  if (!outcome.ok) {
    return {
      message: outcome.reason === "too_late" ? "Trop tard pour annuler" : "Rien à annuler.",
    };
  }
  refresh();
  return { message: "Suivi repris : rien n'a été enregistré" };
}
