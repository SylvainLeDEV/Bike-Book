"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { SaveMaintenanceResult } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import { createMaintenanceEvent, undoMaintenanceEvent } from "@/server/db";
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

/** "Annuler" after "Entretien enregistré" (D-60). */
export async function undoMaintenanceAction(eventId: unknown): Promise<{ message: string }> {
  const ctx = await requireAccessContext();
  const id = z.number().int().positive().safeParse(eventId);
  if (!id.success) return { message: "Rien à annuler." };
  const outcome = undoMaintenanceEvent(ctx, id.data);
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
