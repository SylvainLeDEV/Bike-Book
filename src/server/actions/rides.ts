"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { formatDuration } from "@/lib/format";
import type { QuickRideResult } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import { createRide, getBike, undoCreateRide } from "@/server/db";
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

/** "Annuler" after "Sortie ajoutée" (D-60). */
export async function undoCreateRideAction(rideId: unknown): Promise<{ message: string }> {
  const ctx = await requireAccessContext();
  const id = z.number().int().positive().safeParse(rideId);
  if (!id.success || !undoCreateRide(ctx, id.data).ok) return { message: "Rien à annuler." };
  refresh();
  return { message: "Sortie supprimée" };
}
