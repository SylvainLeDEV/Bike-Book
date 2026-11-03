"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { agreed, replacedTitle, slotLabel } from "@/lib/display";
import type { ReplacePartResult, SaveComponentResult } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import {
  createComponent,
  getComponent,
  listInventory,
  replaceComponent,
  undoReplacement,
  updateComponent,
} from "@/server/db";
import { eventInstant } from "@/server/domain/time";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import {
  componentSaveErrors,
  parseComponentInput,
  replacementError,
  replacePartSchema,
  toComponentData,
} from "./component-input";

const id = z.number().int().positive();

/** "Ajouter un composant" (`componentId` null) and "Modifier le composant". */
export async function saveComponentAction(
  bikeId: unknown,
  componentId: unknown,
  input: unknown,
): Promise<SaveComponentResult> {
  const ctx = await requireAccessContext();
  const ids = z
    .object({ bikeId: id, componentId: id.nullable() })
    .safeParse({ bikeId, componentId });
  if (!ids.success) return { ok: false, error: "Pièce introuvable." };
  const parsed = parseComponentInput(input, today());
  if (!parsed.success) return { ok: false, fieldErrors: parsed.fieldErrors };

  const data = toComponentData(parsed.data, Date.now(), getEnv().timeZone);
  const label = slotLabel(parsed.data.typeCode, parsed.data.position);
  if (ids.data.componentId == null) {
    const outcome = createComponent(
      ctx,
      ids.data.bikeId,
      { typeCode: parsed.data.typeCode, position: parsed.data.position },
      data,
      parsed.data.templateIds ?? [],
    );
    if (!outcome.ok) {
      return { ok: false, ...componentSaveErrors(outcome, parsed.data, "Vélo introuvable.") };
    }
    refresh();
    return {
      ok: true,
      componentId: outcome.componentId,
      message: `${label} ${agreed(parsed.data.typeCode, "ajouté")}`,
    };
  }

  const current = getComponent(ctx, ids.data.componentId);
  if (!current || current.bikeId !== ids.data.bikeId)
    return { ok: false, error: "Pièce introuvable." };
  const outcome = updateComponent(ctx, current.id, data);
  if (!outcome.ok) {
    return { ok: false, ...componentSaveErrors(outcome, current, "Pièce introuvable.") };
  }
  refresh();
  return { ok: true, componentId: current.id, message: "Pièce enregistrée" };
}

/** "Remplacer une pièce", part typed by hand ("Autre pièce, hors atelier"; workshop: feature 8). */
export async function replacePartAction(input: unknown): Promise<ReplacePartResult> {
  const ctx = await requireAccessContext();
  const parsed = replacePartSchema(today()).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const data = parsed.data;
  const old = getComponent(ctx, data.removedComponentId);
  if (!old) return { ok: false, error: "Pièce introuvable." };

  const fromItem =
    data.fromItemId == null
      ? null
      : (listInventory(ctx).find((item) => item.id === data.fromItemId) ?? null);
  if (data.fromItemId != null && !fromItem) {
    return { ok: false, error: "Objet de l'atelier introuvable." };
  }
  const { timeZone } = getEnv();
  const recordedAt = Date.now();
  const outcome = replaceComponent(ctx, {
    removedComponentId: old.id,
    on: data.on,
    recordedAt,
    at: eventInstant(data.on, recordedAt, timeZone),
    reason: data.reason,
    removalNote: data.removalNote,
    newPart: {
      brand: data.brand,
      model: data.model,
      reference: fromItem?.reference ?? null,
      priceCents: data.priceCents,
    },
    fromItemId: fromItem?.id ?? null,
    eventTitle: replacedTitle(old.typeCode, old.position),
    eventId: data.eventId,
  });
  if (!outcome.ok) return { ok: false, error: replacementError(outcome, timeZone) };
  refresh();
  return {
    ok: true,
    message: replacedTitle(old.typeCode, old.position),
    undoItemId: outcome.itemId,
    eventId: outcome.eventId,
  };
}

/** "Annuler" after a replacement (D-60). */
export async function undoReplacePartAction(
  itemId: unknown,
): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireAccessContext();
  const parsed = id.safeParse(itemId);
  if (!parsed.success) return { ok: false, message: "Rien à annuler." };
  const outcome = undoReplacement(ctx, parsed.data);
  if (!outcome.ok) {
    return {
      ok: false,
      message:
        outcome.reason === "too_late"
          ? "Trop tard pour annuler : la pièce a déjà servi ailleurs."
          : "Rien à annuler.",
    };
  }
  refresh();
  return { ok: true, message: "Remplacement annulé" };
}
