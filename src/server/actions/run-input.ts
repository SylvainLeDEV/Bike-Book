import "server-only";
import { z } from "zod";
import { MAINTENANCE_LINE_ACTIONS, PRODUCT_LEVELS } from "@/lib/enums";
import { isLocalDate, type LocalDate } from "@/lib/format";
import { cleanName } from "@/lib/names";
import type { FinishRunData } from "@/server/db";

// Validation of a run ("suivi", D-87; D-50: clean on the way in): its steps and its summary.

export const runId = z.number().int().positive();

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au maximum.`)
    .nullable()
    .transform((value) => value || null);

export const stepPatchSchema = z
  .object({
    done: z.boolean().optional(),
    comment: text(1000).optional(),
  })
  .refine((patch) => patch.done !== undefined || patch.comment !== undefined, "Rien à changer.");

export const stepInstruction = z
  .string()
  .trim()
  .min(1, "Écris ce qu'il faut faire.")
  .max(2000, "2000 caractères au maximum.");

const id = z.number().int().positive();

export function finishRunSchema(today: LocalDate) {
  return z.object({
    performedOn: z
      .string()
      .refine(isLocalDate, "Date invalide.")
      .refine((date) => date <= today, "La date ne peut pas être dans le futur."),
    title: z
      .string()
      .transform(cleanName)
      .pipe(
        z.string().min(1, "Donne un titre à l'entretien.").max(120, "120 caractères au maximum."),
      ),
    notes: text(2000),
    laborMinutes: z
      .number({ error: "Temps passé invalide." })
      .int("Temps passé invalide.")
      .min(1, "Temps passé invalide.")
      .max(24 * 60, "Temps passé invalide.")
      .nullable(),
    action: z.enum(MAINTENANCE_LINE_ACTIONS),
    componentId: id.nullable(),
    ruleId: id.nullable(),
    costCents: z
      .number({ error: "Coût invalide." })
      .int("Coût invalide.")
      .min(0, "Coût invalide.")
      .max(100_000_000, "Coût invalide.")
      .nullable(),
    joinEventId: id.nullable(),
    parts: z.array(z.object({ itemId: id, quantity: z.number().int().min(0).max(1000) })).max(60),
    products: z.array(z.object({ itemId: id, levelAfter: z.enum(PRODUCT_LEVELS) })).max(60),
    saveAsProcedure: z.boolean(),
  });
}

/** The summary, checked and turned into what "Terminer" writes (no event for a general task). */
export function parseFinishRun(
  input: unknown,
  today: LocalDate,
  writesEvent: boolean,
  at: number,
): { ok: true; data: FinishRunData } | { ok: false; error: string } {
  const parsed = finishRunSchema(today).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const value = parsed.data;
  return {
    ok: true,
    data: {
      at,
      performedOn: value.performedOn,
      title: value.title,
      notes: value.notes,
      laborTimeS: value.laborMinutes == null ? null : value.laborMinutes * 60,
      line: writesEvent
        ? {
            action: value.action,
            componentId: value.componentId,
            ruleId: value.ruleId,
            costCents: value.costCents,
          }
        : null,
      joinEventId: writesEvent ? value.joinEventId : null,
      parts: writesEvent ? value.parts.filter((part) => part.quantity > 0) : [],
      products: writesEvent ? value.products : [],
      saveAsProcedure: value.saveAsProcedure,
    },
  };
}
