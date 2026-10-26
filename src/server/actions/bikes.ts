"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { SaveBikeResult } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import { createBike, getBike, updateBike } from "@/server/db";
import { today } from "@/server/time";
import { parseBikeInput, toBikeData } from "./bike-input";

const bikeIdSchema = z.number().int().positive().nullable();

/**
 * "Ajouter un vélo" (`bikeId` null) and "Modifier le vélo". The input is validated again here
 * (D-50); the bike must belong to the current workspace (D-25).
 */
export async function saveBikeAction(bikeId: unknown, input: unknown): Promise<SaveBikeResult> {
  const ctx = await requireAccessContext();
  const id = bikeIdSchema.safeParse(bikeId);
  if (!id.success) return { ok: false, error: "Vélo introuvable." };

  const day = today();
  const parsed = parseBikeInput(input, day);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.fieldErrors };

  const previous = id.data == null ? null : getBike(ctx, id.data);
  if (id.data != null && !previous) return { ok: false, error: "Vélo introuvable." };

  const data = toBikeData(parsed.data, previous, day);
  const outcome = id.data == null ? createBike(ctx, data) : updateBike(ctx, id.data, data);
  if (!outcome.ok) {
    return outcome.reason === "name_taken"
      ? { ok: false, fieldErrors: { name: `Tu as déjà un vélo nommé « ${outcome.takenBy} ».` } }
      : { ok: false, error: "Vélo introuvable." };
  }
  refresh();
  return { ok: true, bikeId: outcome.bikeId, name: data.name };
}
