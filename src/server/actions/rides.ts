"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { formatDuration } from "@/lib/format";
import type { EditResult, QuickRideResult } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import { createRide, deleteRide, getBike, updateRide } from "@/server/db";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";
import { quickRideSchema, toRideData } from "./ride-input";

/** The quick ride entry (principle 1). */
export async function createRideAction(input: unknown): Promise<QuickRideResult> {
  const ctx = await requireAccessContext();
  const parsed = quickRideSchema(today()).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const bike = getBike(ctx, parsed.data.bikeId);
  if (!bike) return { ok: false, error: "Vélo introuvable." };
  const data = toRideData(parsed.data, getEnv().timeZone);
  const outcome = createRide(ctx, data);
  if (!outcome.ok) return { ok: false, error: "Vélo introuvable." };
  refresh();
  return {
    ok: true,
    message: `Sortie ajoutée à ${bike.name} · ${formatDuration(data.totalTimeS ?? 0)}`,
    undoRideId: outcome.rideId,
  };
}

const rideIdSchema = z.number().int().positive();

/** "Modifier la sortie" (D-70): the same sheet and checks as the quick entry. */
export async function updateRideAction(rideId: unknown, input: unknown): Promise<EditResult> {
  const ctx = await requireAccessContext();
  const id = rideIdSchema.safeParse(rideId);
  const parsed = quickRideSchema(today()).safeParse(input);
  if (!id.success) return { ok: false, error: "Sortie introuvable." };
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  if (!updateRide(ctx, id.data, toRideData(parsed.data, getEnv().timeZone)).ok) {
    return { ok: false, error: "Sortie introuvable." };
  }
  refresh();
  return { ok: true, message: "Sortie modifiée" };
}

/** "Supprimer la sortie" (D-70), confirmed in the sheet. */
export async function deleteRideAction(rideId: unknown): Promise<EditResult> {
  const ctx = await requireAccessContext();
  const id = rideIdSchema.safeParse(rideId);
  if (!id.success || !deleteRide(ctx, id.data).ok) {
    return { ok: false, error: "Cette sortie ne peut pas être supprimée." };
  }
  refresh();
  return { ok: true, message: "Sortie supprimée" };
}

/** "Annuler" after "Sortie ajoutée" (D-60). */
export async function undoCreateRideAction(rideId: unknown): Promise<{ message: string }> {
  const ctx = await requireAccessContext();
  const id = rideIdSchema.safeParse(rideId);
  if (!id.success || !deleteRide(ctx, id.data).ok) return { message: "Rien à annuler." };
  refresh();
  return { message: "Sortie supprimée" };
}
