"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { SaveSetupResult } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import {
  createSetup,
  deleteSetup,
  getSetupBikeId,
  listSuspensionSpecs,
  saveSuspensionSpecs,
  updateSetup,
  type AccessContext,
} from "@/server/db";
import { today } from "@/server/time";
import { toSpecsInput } from "@/server/views/setups";
import { suspensionSpecsSchema } from "./component-input";
import { parseSetupInput } from "./setup-input";

// The setup log of the "Réglages" tab (D-79).

const id = z.number().int().positive();

function parse(ctx: AccessContext, bikeId: number, input: unknown) {
  const specs = new Map(listSuspensionSpecs(ctx, bikeId).map((s) => [s.componentId, s]));
  return parseSetupInput(input, today(), (componentId) => toSpecsInput(specs.get(componentId)));
}

/** "Nouveau réglage" and "Revenir à ce réglage": a new dated setup of the bike. */
export async function createSetupAction(bikeId: unknown, input: unknown): Promise<SaveSetupResult> {
  const ctx = await requireAccessContext();
  const parsedId = id.safeParse(bikeId);
  if (!parsedId.success) return { ok: false, error: "Vélo introuvable." };
  const parsed = parse(ctx, parsedId.data, input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.fieldErrors };
  const outcome = createSetup(ctx, parsedId.data, parsed.data);
  if (!outcome.ok) {
    return {
      ok: false,
      error: outcome.reason === "invalid_part" ? "Pièce introuvable." : "Vélo introuvable.",
    };
  }
  refresh();
  return { ok: true, message: "Réglage enregistré" };
}

/** "Modifier le réglage": a correction of that setup, values included. */
export async function updateSetupAction(
  setupId: unknown,
  input: unknown,
): Promise<SaveSetupResult> {
  const ctx = await requireAccessContext();
  const parsedId = id.safeParse(setupId);
  const bikeId = parsedId.success ? getSetupBikeId(ctx, parsedId.data) : null;
  if (!parsedId.success || bikeId == null) return { ok: false, error: "Réglage introuvable." };
  const parsed = parse(ctx, bikeId, input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.fieldErrors };
  const outcome = updateSetup(ctx, parsedId.data, parsed.data);
  if (!outcome.ok) {
    return {
      ok: false,
      error: outcome.reason === "invalid_part" ? "Pièce introuvable." : "Réglage introuvable.",
    };
  }
  refresh();
  return { ok: true, message: "Réglage modifié" };
}

/** "Supprimer ce réglage": a hard delete that fixes a mistake (D-70). */
export async function deleteSetupAction(setupId: unknown): Promise<SaveSetupResult> {
  const ctx = await requireAccessContext();
  const parsedId = id.safeParse(setupId);
  if (!parsedId.success || !deleteSetup(ctx, parsedId.data)) {
    return { ok: false, error: "Réglage introuvable." };
  }
  refresh();
  return { ok: true, message: "Réglage supprimé" };
}

/** "Débattement et molettes" (D-83): what a fork or rear shock is, from the setup tab. */
export async function saveSuspensionSpecsAction(
  componentId: unknown,
  specs: unknown,
): Promise<SaveSetupResult> {
  const ctx = await requireAccessContext();
  const parsedId = id.safeParse(componentId);
  const parsed = suspensionSpecsSchema.safeParse(specs);
  if (!parsedId.success) return { ok: false, error: "Pièce introuvable." };
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  if (!saveSuspensionSpecs(ctx, parsedId.data, parsed.data)) {
    return { ok: false, error: "Pièce introuvable." };
  }
  refresh();
  return { ok: true, message: "Pièce enregistrée" };
}
