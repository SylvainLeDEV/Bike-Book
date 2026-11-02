"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAccessContext } from "@/server/auth/context";
import {
  createItem,
  createProcedure,
  deleteProcedure,
  linkProcedureItem,
  listProcedures,
  setProcedureArchived,
  updateProcedure,
} from "@/server/db";
import { today } from "@/server/time";
import { parseProcedureInput } from "./procedure-input";
import { itemInputSchema, newItem } from "./workshop-input";

// Maintenance procedures ("fiches", D-86): the editor, archiving (with "Annuler", D-60), deleting
// for good (confirmed in the sheet, D-70), and "Ajouter à l'atelier" from a line typed as text.

const id = z.number().int().positive();
const NOT_FOUND = { ok: false, error: "Fiche introuvable." } as const;

/** "Nouvelle fiche" (`procedureId` null) and "Modifier la fiche". */
export async function saveProcedureAction(
  procedureId: unknown,
  input: unknown,
): Promise<{ ok: true; message: string; procedureId: number } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsedId = id.nullable().safeParse(procedureId);
  if (!parsedId.success) return NOT_FOUND;
  const parsed = parseProcedureInput(input);
  if (!parsed.ok) return parsed;
  if (parsedId.data == null) {
    const outcome = createProcedure(ctx, parsed.data);
    if (!outcome.ok) return { ok: false, error: "Vélo ou objet de l'atelier introuvable." };
    refresh();
    return {
      ok: true,
      message: `Fiche créée : ${parsed.data.title}`,
      procedureId: outcome.procedureId,
    };
  }
  if (!updateProcedure(ctx, parsedId.data, parsed.data).ok) {
    return { ok: false, error: "Fiche, vélo ou objet de l'atelier introuvable." };
  }
  refresh();
  return {
    ok: true,
    message: `Fiche enregistrée : ${parsed.data.title}`,
    procedureId: parsedId.data,
  };
}

/** "Archiver la fiche" / "Désarchiver"; "Annuler" calls it back with the other value. */
export async function archiveProcedureAction(
  procedureId: unknown,
  archived: unknown,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsed = z.object({ procedureId: id, archived: z.boolean() }).safeParse({
    procedureId,
    archived,
  });
  if (!parsed.success) return NOT_FOUND;
  const outcome = setProcedureArchived(
    ctx,
    parsed.data.procedureId,
    parsed.data.archived ? Date.now() : null,
  );
  if (!outcome.ok) return NOT_FOUND;
  refresh();
  return { ok: true, message: parsed.data.archived ? "Fiche archivée" : "Fiche désarchivée" };
}

/** "Supprimer la fiche", once confirmed: for good, its photos and documents with it (D-86). */
export async function deleteProcedureAction(
  procedureId: unknown,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsed = id.safeParse(procedureId);
  if (!parsed.success) return NOT_FOUND;
  const title = listProcedures(ctx).find((p) => p.id === parsed.data)?.title;
  if (!title || !deleteProcedure(ctx, parsed.data).ok) return NOT_FOUND;
  refresh();
  return { ok: true, message: `Fiche supprimée : ${title}` };
}

/**
 * "Ajouter à l'atelier" on a line typed as text, or a part type the workshop lacks: the item is
 * created, then the line names it (D-86).
 */
export async function addLineItemAction(
  lineId: unknown,
  input: unknown,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const ctx = await requireAccessContext();
  const parsedId = id.safeParse(lineId);
  const parsed = itemInputSchema.safeParse(input);
  if (!parsedId.success) return NOT_FOUND;
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const data = parsed.data;
  const created = createItem(ctx, newItem(data, Date.now(), today()));
  if (!created.ok) return { ok: false, error: "Vélo introuvable." };
  if (!linkProcedureItem(ctx, parsedId.data, created.itemId).ok) return NOT_FOUND;
  refresh();
  return { ok: true, message: `Nouvel objet dans l'atelier : ${data.name}` };
}
