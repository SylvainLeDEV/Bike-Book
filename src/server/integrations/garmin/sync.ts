import "server-only";
import { localDateOf } from "@/lib/format";
import { decryptSecret } from "@/server/auth/secrets";
import {
  createAttachment,
  getIntegration,
  importActivity,
  knownExternalIds,
  latestActivityStart,
  listActivityTypeBikes,
  listBikes,
  listRides,
  listSyncTargets,
  recordSyncOutcome,
  type AccessContext,
  type Integration,
} from "@/server/db";
import { canBeRidden } from "@/server/domain/bikes";
import {
  decideAssignment,
  importStartDay,
  isTooShort,
  keyState,
  keyUsable,
  rideFromActivity,
  rideTypeFor,
  toImportedActivity,
  type ImportedActivity,
} from "@/server/domain/garmin";
import { quickRideDefaults, ridesNear } from "@/server/domain/rides";
import { getEnv, type GarminConfig } from "@/server/env";
import { removeStoredFiles, writeOwnFile } from "@/server/files/storage";
import { today } from "@/server/time";
import { clearGarminTokens, GarminClient, type GarminDeps } from "./client";
import { GarminError } from "./errors";

// The Garmin import (D-101): reads the cycling activities since the last one imported (the
// first time, since the day chosen in Paramètres), and makes each one a ride of the bike set for
// its type, or leaves it in "À classer". Runs again safely: activities are skipped by their id.
// One JSON line per run on stdout, never the key nor a token.

/** The purpose the key is encrypted for (src/server/auth/secrets.ts). */
export const GARMIN_KEY_PURPOSE = "garmin_api_key";

export type SyncSummary =
  | {
      ok: true;
      /** Activities Garmin returned, the too-short ones and those already read left out. */
      read: number;
      imported: number;
      pending: number;
      /** Already read before (an import run again, or the day read twice on purpose). */
      known: number;
      tooShort: number;
      fitFiles: number;
    }
  | { ok: false; reason: "not_connected" | "running" | "key_expired" | "key_unreadable" }
  | { ok: false; reason: "garmin"; kind: GarminError["kind"]; message: string };

const running = new Set<number>();
/** The last day an expiry warning was logged per integration, so it is logged once a day. */
const warnedOn = new Map<number, string>();

export const KEY_EXPIRED_MESSAGE =
  "La clé API Garmin a expiré : l'import est suspendu. Crée une nouvelle clé dans Garmin Connect (Paramètres → Clé API personnelle) et enregistre-la ici.";
export const KEY_UNREADABLE_MESSAGE =
  "La clé enregistrée ne peut plus être lue (le secret de l'application a changé) : enregistre-la à nouveau.";

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: "garmin_sync", ...fields }));
}

/** Imports the new Garmin activities of one user in one workspace. */
export async function syncGarmin(
  ctx: AccessContext,
  options: { config?: GarminConfig; deps?: GarminDeps; now?: number } = {},
): Promise<SyncSummary> {
  const integration = getIntegration(ctx, "garmin");
  if (!integration) return { ok: false, reason: "not_connected" };
  if (running.has(integration.id)) return { ok: false, reason: "running" };
  running.add(integration.id);
  try {
    return await runSync(ctx, integration, options);
  } finally {
    running.delete(integration.id);
  }
}

async function runSync(
  ctx: AccessContext,
  integration: Integration,
  options: { config?: GarminConfig; deps?: GarminDeps; now?: number },
): Promise<SyncSummary> {
  const { timeZone, garmin: envConfig } = getEnv();
  const config = options.config ?? envConfig;
  const now = options.now ?? Date.now();
  const day = today(now);
  const base = { workspace_id: ctx.workspace.id, integration_id: integration.id };

  const state = keyState({
    expiresOn: integration.keyExpiresOn,
    rejected: integration.status === "key_rejected",
    today: day,
    warnDays: config.keyWarnDays,
  });
  if (state.state === "rejected")
    return {
      ok: false,
      reason: "garmin",
      kind: "key_rejected",
      message: integration.lastError ?? "",
    };
  if (!keyUsable(state)) {
    recordSyncOutcome(ctx, "garmin", {
      at: new Date(now),
      ok: false,
      error: KEY_EXPIRED_MESSAGE,
      keyRejected: false,
    });
    log({ ...base, outcome: "key_expired", key_expires_on: integration.keyExpiresOn });
    return { ok: false, reason: "key_expired" };
  }
  if (state.state === "expires_soon" && warnedOn.get(integration.id) !== day) {
    warnedOn.set(integration.id, day);
    console.warn(
      JSON.stringify({
        event: "garmin_key_expiring",
        ...base,
        key_expires_on: integration.keyExpiresOn,
        days_left: state.daysLeft,
      }),
    );
  }

  const key = decryptSecret(integration.keyCiphertext, GARMIN_KEY_PURPOSE);
  if (key == null) {
    recordSyncOutcome(ctx, "garmin", {
      at: new Date(now),
      ok: false,
      error: KEY_UNREADABLE_MESSAGE,
      keyRejected: false,
    });
    log({ ...base, outcome: "key_unreadable" });
    return { ok: false, reason: "key_unreadable" };
  }

  const client = new GarminClient({
    baseUrl: config.apiBaseUrl,
    key,
    tokenRefreshMarginS: config.tokenRefreshMarginS,
    deps: options.deps,
  });
  const latest = latestActivityStart(ctx, "garmin");
  const startDay = importStartDay(
    integration.importFrom,
    latest == null ? null : localDateOf(latest, timeZone),
  );
  const counts = { read: 0, imported: 0, pending: 0, known: 0, tooShort: 0, fitFiles: 0 };

  try {
    for await (const page of client.cyclingActivities({
      startDay,
      minDurationS: config.minDurationS,
    })) {
      const activities: ImportedActivity[] = [];
      for (const summary of page) {
        const activity = toImportedActivity(summary);
        // Before the first import's day (Garmin's day may differ from the app's by a time zone).
        if (!activity || (activity.localDay != null && activity.localDay < integration.importFrom))
          continue;
        if (isTooShort(activity, config.minDurationS)) {
          counts.tooShort++;
          continue;
        }
        activities.push(activity);
      }
      const known = knownExternalIds(
        ctx,
        "garmin",
        activities.map((a) => a.externalId),
      );
      for (const activity of activities) {
        if (known.has(activity.externalId)) {
          counts.known++;
          continue;
        }
        counts.read++;
        const outcome = importOne(ctx, activity);
        if (!outcome) continue;
        if (outcome.rideId == null) counts.pending++;
        else {
          counts.imported++;
          if (
            config.downloadFit &&
            (await keepFitFile(ctx, client, activity, outcome.rideId, now))
          ) {
            counts.fitFiles++;
          }
        }
      }
    }
  } catch (error) {
    if (!(error instanceof GarminError)) throw error;
    const keyRejected = error.kind === "key_rejected";
    if (keyRejected) clearGarminTokens();
    recordSyncOutcome(ctx, "garmin", {
      at: new Date(now),
      ok: false,
      error: error.userMessage,
      keyRejected,
    });
    log({
      ...base,
      outcome: "error",
      kind: error.kind,
      detail: error.detail,
      start_day: startDay,
      ...snake(counts),
    });
    return { ok: false, reason: "garmin", kind: error.kind, message: error.userMessage };
  }

  recordSyncOutcome(ctx, "garmin", {
    at: new Date(now),
    ok: true,
    error: null,
    keyRejected: false,
  });
  log({ ...base, outcome: "ok", start_day: startDay, ...snake(counts) });
  return { ok: true, ...counts };
}

function snake(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [
      key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
      value,
    ]),
  );
}

/**
 * One activity: a ride of the bike set for its type (with the bike's usual ride type when
 * Garmin's is not specific), or "À classer". Read fresh for each activity, so a ride imported
 * a moment ago counts for the next one's checks.
 */
function importOne(ctx: AccessContext, activity: ImportedActivity) {
  const bikes = listBikes(ctx);
  const typeBikeId = listActivityTypeBikes(ctx, "garmin").get(activity.activityType);
  const bike = bikes.find((b) => b.id === typeBikeId) ?? null;
  const manualRides = bike
    ? listRides(ctx, { bikeId: bike.id }).filter((ride) => ride.source === "manual")
    : [];
  const assignment = decideAssignment({
    typeBike: bike ? { id: bike.id, ridden: canBeRidden(bike.status) } : null,
    nearManualRide:
      bike != null &&
      ridesNear(manualRides, { bikeId: bike.id, startedAt: activity.startedAt }).length > 0,
  });
  if (assignment.kind === "pending") {
    const outcome = importActivity(ctx, "garmin", activity, assignment);
    return outcome.ok ? outcome : null;
  }
  const ride = rideForBike(ctx, activity, assignment.bikeId);
  const outcome = importActivity(ctx, "garmin", activity, { kind: "ride", ride });
  return outcome.ok ? outcome : null;
}

/**
 * The ride an activity becomes on a bike: Garmin's ride type when it is specific, else the
 * bike's usual one (its most frequent, else its discipline's), as the quick entry offers it.
 */
export function rideForBike(
  ctx: AccessContext,
  activity: Parameters<typeof rideFromActivity>[0] & { activityType: string },
  bikeId: number,
) {
  const usual =
    quickRideDefaults(listRides(ctx, { limit: 500 }), listBikes(ctx)).usualRideType.get(bikeId) ??
    "trail";
  return rideFromActivity(activity, bikeId, rideTypeFor(activity.activityType, usual));
}

/**
 * With GARMIN_DOWNLOAD_FIT, the ride's FIT file as an attachment of the ride. A failure is
 * logged and the ride stays: the file is a bonus, never a reason to stop the import.
 */
async function keepFitFile(
  ctx: AccessContext,
  client: GarminClient,
  activity: ImportedActivity,
  rideId: number,
  now: number,
): Promise<boolean> {
  try {
    const fit = await client.fitFile(activity.externalId);
    const stored = await writeOwnFile(fit.data, "fit", now);
    const outcome = createAttachment(
      ctx,
      { kind: "ride", id: rideId },
      {
        kind: "other",
        storagePath: stored.storagePath,
        originalName: `garmin-${activity.localDay ?? "activite"}.fit`,
        mimeType: "application/vnd.ant.fit",
        sizeBytes: stored.sizeBytes,
        sha256: stored.sha256,
        widthPx: null,
        heightPx: null,
        takenAt: null,
        caption: "Fichier FIT Garmin",
      },
    );
    if (!outcome.ok) {
      removeStoredFiles([stored.storagePath]);
      return false;
    }
    return true;
  } catch (error) {
    // A key refused here is refused for the list too: let the import stop on it.
    if (error instanceof GarminError && error.kind === "key_rejected") throw error;
    log({
      workspace_id: ctx.workspace.id,
      outcome: "fit_failed",
      ride_id: rideId,
      detail: error instanceof GarminError ? error.detail : (error as Error)?.name,
    });
    return false;
  }
}

/** Every Garmin link's import, one after the other (the scheduler). */
export async function syncAllGarmin(options: { deps?: GarminDeps } = {}): Promise<void> {
  for (const { ctx } of listSyncTargets("garmin")) {
    try {
      await syncGarmin(ctx, options);
    } catch (error) {
      log({ workspace_id: ctx.workspace.id, outcome: "crash", detail: (error as Error)?.message });
    }
  }
}
