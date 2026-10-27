"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { EditResult, SaveMaintenanceResult } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import {
  createMaintenanceEvent,
  deleteMaintenanceEvent,
  updateMaintenanceEvent,
} from "@/server/db";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { maintenanceSchema } from "./maintenance-input";

/** "Nouvel entretien" (D-63). */
export async function saveMaintenanceAction(input: unknown): Promise<SaveMaintenanceResult> {
  const ctx = await requireAccessContext();
  const parsed = maintenanceSchema(today()).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const data = parsed.data;
  const outcome = createMaintenanceEvent(ctx, {
    bikeId: data.bikeId,
    performedOn: data.on,
    title: data.title,
    performedBy: data.performedBy,
    shop: data.performedBy === "shop" ? data.shop : null,
    totalCostCents: data.totalCostCents,
    notes: data.notes,
    recordedAt: Date.now(),
    lines: data.lines,
  });
  if (!outcome.ok) {
    return {
      ok: false,
      error:
        outcome.reason === "unknown_part" ? "Pièce introuvable sur ce vélo." : "Vélo introuvable.",
    };
  }
  refresh();
  return {
    ok: true,
    message: `Entretien enregistré : ${data.title}`,
    undoEventId: outcome.eventId,
  };
}

const eventIdSchema = z.number().int().positive();

/** "Modifier l'entretien" (D-70): its replacements keep their parts and follow a new date. */
export async function updateMaintenanceAction(
  eventId: unknown,
  input: unknown,
): Promise<EditResult> {
  const ctx = await requireAccessContext();
  const id = eventIdSchema.safeParse(eventId);
  const parsed = maintenanceSchema(today()).safeParse(input);
  if (!id.success) return { ok: false, error: "Entretien introuvable." };
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const data = parsed.data;
  const outcome = updateMaintenanceEvent(
    ctx,
    id.data,
    {
      performedOn: data.on,
      title: data.title,
      performedBy: data.performedBy,
      shop: data.performedBy === "shop" ? data.shop : null,
      totalCostCents: data.totalCostCents,
      notes: data.notes,
      lines: data.lines,
    },
    getEnv().timeZone,
  );
  if (!outcome.ok) {
    return {
      ok: false,
      error: {
        not_found: "Entretien introuvable.",
        unknown_part: "Pièce introuvable sur ce vélo.",
        unknown_rule: "Règle introuvable sur ce vélo.",
        before_fitting: "La pièce remplacée a été montée après cette date.",
        after_removal: "La pièce montée par cet entretien a été remplacée avant cette date.",
      }[outcome.reason],
    };
  }
  refresh();
  return { ok: true, message: `Entretien modifié : ${data.title}` };
}

/** "Supprimer l'entretien" (D-70), confirmed in the sheet: its replacements are undone too. */
export async function deleteMaintenanceAction(eventId: unknown): Promise<EditResult> {
  const ctx = await requireAccessContext();
  const id = eventIdSchema.safeParse(eventId);
  if (!id.success) return { ok: false, error: "Entretien introuvable." };
  const outcome = deleteMaintenanceEvent(ctx, id.data);
  if (!outcome.ok) {
    return {
      ok: false,
      error:
        outcome.reason === "too_late"
          ? "La pièce montée par cet entretien a été remplacée ou entretenue depuis : modifie d'abord ces entretiens-là."
          : "Entretien introuvable.",
    };
  }
  refresh();
  return { ok: true, message: "Entretien supprimé" };
}

/** "Annuler" after "Entretien enregistré" (D-60). */
export async function undoMaintenanceAction(eventId: unknown): Promise<{ message: string }> {
  const ctx = await requireAccessContext();
  const id = eventIdSchema.safeParse(eventId);
  if (!id.success) return { message: "Rien à annuler." };
  const outcome = deleteMaintenanceEvent(ctx, id.data, { keepReplacements: true });
  if (!outcome.ok) {
    return {
      message:
        outcome.reason === "too_late"
          ? "Trop tard pour annuler : un remplacement a été ajouté à cet entretien."
          : "Rien à annuler.",
    };
  }
  refresh();
  return { message: "Entretien supprimé" };
}
