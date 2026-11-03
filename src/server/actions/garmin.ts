"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { formatCount } from "@/lib/format";
import type { EditResult, GarminKeyResult } from "@/lib/view-models";
import { requireAccessContext } from "@/server/auth/context";
import { encryptSecret } from "@/server/auth/secrets";
import {
  assignPendingActivity,
  deleteIntegration,
  getExternalActivity,
  getIntegration,
  ignorePendingActivity,
  linkPendingActivity,
  listActivityTypeBikes,
  listRides,
  restoreIgnoredActivity,
  saveIntegrationKey,
  setActivityTypeBike,
  updateIntegrationDates,
} from "@/server/db";
import { ridesNear } from "@/server/domain/rides";
import { clearGarminTokens } from "@/server/integrations/garmin/client";
import { GARMIN_KEY_PURPOSE, rideForBike, syncGarmin } from "@/server/integrations/garmin/sync";
import { activityTypeSchema, garminKeyInputSchema } from "./garmin-input";

// Garmin Connect in Paramètres and "À classer" (D-101). The key is encrypted before it reaches
// the data-access layer and is never sent back; these answers never contain it.

const idSchema = z.number().int().positive();

/** "Enregistrer" in "Clé API Garmin": a new key, or only its dates when `key` is empty. */
export async function saveGarminKeyAction(input: unknown): Promise<GarminKeyResult> {
  const ctx = await requireAccessContext();
  const parsed = garminKeyInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      fieldErrors[field] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const { key, keyExpiresOn, importFrom } = parsed.data;
  if (!key) {
    if (!getIntegration(ctx, "garmin")) {
      return { ok: false, fieldErrors: { key: "Colle la clé API créée dans Garmin Connect." } };
    }
    updateIntegrationDates(ctx, "garmin", { keyExpiresOn, importFrom });
    refresh();
    return { ok: true, message: "Dates enregistrées" };
  }
  clearGarminTokens();
  saveIntegrationKey(ctx, "garmin", {
    keyCiphertext: encryptSecret(key, GARMIN_KEY_PURPOSE),
    keyHint: key.slice(-4),
    keyExpiresOn,
    importFrom,
  });
  refresh();
  return { ok: true, message: "Clé Garmin enregistrée" };
}

/** "Synchroniser maintenant": the same import as the scheduled one, at once. */
export async function syncGarminNowAction(): Promise<EditResult> {
  const ctx = await requireAccessContext();
  const summary = await syncGarmin(ctx);
  refresh();
  if (summary.ok) {
    if (summary.imported === 0 && summary.pending === 0)
      return { ok: true, message: "Aucune nouvelle sortie" };
    const parts = [formatCount(summary.imported, "sortie importée", "sorties importées")];
    if (summary.pending > 0)
      parts.push(`${formatCount(summary.pending, "activité", "activités")} à classer`);
    return { ok: true, message: parts.join(", ") };
  }
  switch (summary.reason) {
    case "not_connected":
      return { ok: false, error: "Enregistre d'abord une clé API Garmin." };
    case "running":
      return { ok: false, error: "Un import est déjà en cours : réessaie dans un instant." };
    case "key_expired":
      return { ok: false, error: "La clé a expiré : enregistre une nouvelle clé." };
    case "key_unreadable":
      return { ok: false, error: "La clé ne peut plus être lue : enregistre-la à nouveau." };
    case "garmin":
      return {
        ok: false,
        error: summary.message || "Garmin refuse la clé : enregistre une nouvelle clé.",
      };
  }
}

/** "Déconnecter": the key goes; imported rides and "À classer" stay. */
export async function disconnectGarminAction(): Promise<EditResult> {
  const ctx = await requireAccessContext();
  if (!deleteIntegration(ctx, "garmin")) return { ok: false, error: "Aucune clé enregistrée." };
  clearGarminTokens();
  refresh();
  return { ok: true, message: "Garmin déconnecté" };
}

/** The bike of a Garmin activity type; null sends that type to "À classer". */
export async function setActivityTypeBikeAction(
  activityType: unknown,
  bikeId: unknown,
): Promise<EditResult> {
  const ctx = await requireAccessContext();
  const type = activityTypeSchema.safeParse(activityType);
  const bike = idSchema.nullable().safeParse(bikeId);
  if (!type.success || !bike.success || !setActivityTypeBike(ctx, "garmin", type.data, bike.data)) {
    return { ok: false, error: "Vélo introuvable." };
  }
  refresh();
  return {
    ok: true,
    message: bike.data == null ? "Ce type ira dans « À classer »" : "Vélo enregistré",
  };
}

/** "Importer" in "À classer": a ride of the bike chosen. */
export async function importPendingActivityAction(
  id: unknown,
  bikeId: unknown,
): Promise<EditResult> {
  const ctx = await requireAccessContext();
  const activityId = idSchema.safeParse(id);
  const bike = idSchema.safeParse(bikeId);
  const activity = activityId.success ? getExternalActivity(ctx, activityId.data) : null;
  if (!activity || activity.status !== "new" || !bike.success) {
    return { ok: false, error: "Activité introuvable : elle a peut-être déjà été classée." };
  }
  const outcome = assignPendingActivity(ctx, activity.id, rideForBike(ctx, activity, bike.data));
  if (!outcome.ok) return { ok: false, error: "Activité ou vélo introuvable." };
  refresh();
  return { ok: true, message: "Sortie importée" };
}

/** "C'est la même sortie": linked to the ride typed by hand, nothing added. */
export async function linkPendingActivityAction(id: unknown): Promise<EditResult> {
  const ctx = await requireAccessContext();
  const activityId = idSchema.safeParse(id);
  const activity = activityId.success ? getExternalActivity(ctx, activityId.data) : null;
  if (!activity || activity.status !== "new" || activity.suggestedBikeId == null) {
    return { ok: false, error: "Activité introuvable : elle a peut-être déjà été classée." };
  }
  const near = ridesNear(
    listRides(ctx, { bikeId: activity.suggestedBikeId }).filter((ride) => ride.source === "manual"),
    { bikeId: activity.suggestedBikeId, startedAt: activity.startedAt },
  )[0];
  if (!near) return { ok: false, error: "La sortie saisie à la main n'existe plus." };
  const outcome = linkPendingActivity(ctx, activity.id, near.id);
  if (!outcome.ok) return { ok: false, error: "Activité introuvable." };
  refresh();
  return { ok: true, message: "Activité liée à la sortie saisie" };
}

/** "Ignorer": never imported, never asked again. */
export async function ignorePendingActivityAction(id: unknown): Promise<EditResult> {
  const ctx = await requireAccessContext();
  const activityId = idSchema.safeParse(id);
  if (!activityId.success || !ignorePendingActivity(ctx, activityId.data).ok) {
    return { ok: false, error: "Activité introuvable : elle a peut-être déjà été classée." };
  }
  refresh();
  return { ok: true, message: "Activité ignorée" };
}

/** "Remettre à classer": an ignored activity waits in "À classer" again, its type's bike offered. */
export async function restoreIgnoredActivityAction(id: unknown): Promise<EditResult> {
  const ctx = await requireAccessContext();
  const activityId = idSchema.safeParse(id);
  const activity = activityId.success ? getExternalActivity(ctx, activityId.data) : null;
  if (!activity || activity.status !== "ignored") {
    return {
      ok: false,
      error: "Activité introuvable : elle a peut-être déjà été remise à classer.",
    };
  }
  const typeBike = listActivityTypeBikes(ctx, activity.provider).get(activity.activityType) ?? null;
  if (!restoreIgnoredActivity(ctx, activity.id, typeBike).ok) {
    return { ok: false, error: "Activité introuvable." };
  }
  refresh();
  return { ok: true, message: "Activité remise à classer" };
}
