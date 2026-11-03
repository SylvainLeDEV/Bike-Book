import "server-only";
import { formatCount, localDateOf, localTimeOf } from "@/lib/format";
import { GARMIN_DEFAULT_TYPES, garminTypeLabel, RIDE_TYPE_LABELS } from "@/lib/labels";
import type {
  GarminKeyStateVM,
  GarminSettingsVM,
  PendingActivitiesVM,
  ShellNoticeVM,
} from "@/lib/view-models";
import {
  countPendingActivities,
  getIntegration,
  listActivityTypeBikes,
  listBikes,
  listIgnoredActivities,
  listPendingActivities,
  listRides,
  listSeenActivityTypes,
  type AccessContext,
  type Integration,
} from "@/server/db";
import { canBeRidden } from "@/server/domain/bikes";
import { keyState } from "@/server/domain/garmin";
import { ridesNear } from "@/server/domain/rides";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";

// Garmin Connect in the app (D-101): Paramètres, the notice at the top of every page, and the
// activities waiting in "À classer" (Activité). The key never leaves the server.

function stateOf(integration: Integration, day: string): GarminKeyStateVM {
  const state = keyState({
    expiresOn: integration.keyExpiresOn,
    rejected: integration.status === "key_rejected",
    today: day,
    warnDays: getEnv().garmin.keyWarnDays,
  });
  if (state.state === "ok" || state.state === "expires_soon") {
    return { state: state.state, daysLeft: state.daysLeft };
  }
  return { state: state.state };
}

function bikeChoices(ctx: AccessContext, alsoIds: Iterable<number> = []) {
  const keep = new Set(alsoIds);
  return listBikes(ctx)
    .filter((bike) => canBeRidden(bike.status) || keep.has(bike.id))
    .map((bike) => ({ id: bike.id, name: bike.name }));
}

export function garminSettingsView(ctx: AccessContext): GarminSettingsVM {
  const { timeZone, garmin } = getEnv();
  const day = today();
  const integration = getIntegration(ctx, "garmin");
  const set = listActivityTypeBikes(ctx, "garmin");
  const seen = new Map(listSeenActivityTypes(ctx, "garmin").map((t) => [t.activityType, t.count]));
  const typeKeys = [...new Set([...seen.keys(), ...set.keys(), ...GARMIN_DEFAULT_TYPES])];
  const types = typeKeys
    .map((activityType) => ({
      activityType,
      label: garminTypeLabel(activityType),
      count: seen.get(activityType) ?? 0,
      bikeId: set.get(activityType) ?? null,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
  return {
    today: day,
    connection: integration
      ? {
          keyHint: integration.keyHint,
          keyExpiresOn: integration.keyExpiresOn,
          keySavedOn: localDateOf(integration.keySavedAt, timeZone),
          importFrom: integration.importFrom,
          keyState: stateOf(integration, day),
          lastSync: integration.lastSyncAt
            ? {
                on: localDateOf(integration.lastSyncAt, timeZone),
                time: localTimeOf(integration.lastSyncAt, timeZone),
              }
            : null,
          lastError: integration.lastError,
        }
      : null,
    types,
    bikes: bikeChoices(ctx, set.values()),
    pendingCount: countPendingActivities(ctx),
    syncIntervalH: garmin.syncIntervalH,
  };
}

/**
 * The notices at the top of every page: the key expires within a warning threshold (30 then
 * 7 days by default), has expired, or Garmin refuses it; activities wait in "À classer".
 */
export function shellNotices(ctx: AccessContext): ShellNoticeVM[] {
  const notices: ShellNoticeVM[] = [];
  const integration = getIntegration(ctx, "garmin");
  if (integration) {
    const state = stateOf(integration, today());
    const settings = { href: "/settings#garmin", action: "Ouvrir les paramètres" };
    if (state.state === "expires_soon") {
      const when =
        state.daysLeft === 0
          ? "aujourd'hui"
          : state.daysLeft === 1
            ? "demain"
            : `dans ${state.daysLeft} jours`;
      notices.push({
        tone: state.daysLeft <= Math.min(...getEnv().garmin.keyWarnDays) ? "late" : "soon",
        message: `La clé API Garmin expire ${when}. Crée-en une nouvelle dans Garmin Connect (Paramètres → Clé API personnelle) pour que l'import continue.`,
        ...settings,
      });
    } else if (state.state === "expired") {
      notices.push({
        tone: "late",
        message:
          "La clé API Garmin a expiré : l'import des sorties est suspendu. Crée une nouvelle clé dans Garmin Connect (Paramètres → Clé API personnelle).",
        ...settings,
      });
    } else if (state.state === "rejected") {
      notices.push({
        tone: "late",
        message:
          "Garmin refuse la clé API (invalide, expirée ou révoquée) : l'import des sorties est suspendu.",
        ...settings,
      });
    }
  }
  const pending = countPendingActivities(ctx);
  if (pending > 0) {
    notices.push({
      tone: "brand",
      message: `${formatCount(pending, "activité Garmin attend", "activités Garmin attendent")} un vélo.`,
      href: "/activity#a-classer",
      action: "Classer",
    });
  }
  return notices;
}

/**
 * "À classer" in Activité: each waiting activity and the ride typed by hand it may be, then the
 * ignored ones ("Remettre à classer").
 */
export function pendingActivitiesView(ctx: AccessContext): PendingActivitiesVM {
  const { timeZone } = getEnv();
  const activities = listPendingActivities(ctx, "garmin");
  const manual = listRides(ctx).filter((ride) => ride.source === "manual");
  return {
    activities: activities.map((activity) => {
      const near =
        activity.pendingReason === "possible_duplicate" && activity.suggestedBikeId != null
          ? ridesNear(manual, {
              bikeId: activity.suggestedBikeId,
              startedAt: activity.startedAt,
            })[0]
          : undefined;
      return {
        id: activity.id,
        startedOn: localDateOf(activity.startedAt, timeZone),
        time: localTimeOf(activity.startedAt, timeZone),
        name: activity.name,
        typeLabel: garminTypeLabel(activity.activityType),
        distanceM: activity.distanceM,
        durationS: activity.durationS ?? activity.movingTimeS,
        elevationGainM: activity.elevationGainM,
        reason: activity.pendingReason ?? "no_bike_for_type",
        suggestedBikeId: activity.suggestedBikeId,
        nearRide: near
          ? {
              id: near.id,
              label: `${near.title ?? near.location ?? RIDE_TYPE_LABELS[near.rideType]} · ${localTimeOf(near.startedAt, timeZone)}`,
            }
          : null,
      };
    }),
    ignored: listIgnoredActivities(ctx, "garmin").map((activity) => ({
      id: activity.id,
      startedOn: localDateOf(activity.startedAt, timeZone),
      time: localTimeOf(activity.startedAt, timeZone),
      name: activity.name,
      typeLabel: garminTypeLabel(activity.activityType),
      distanceM: activity.distanceM,
      durationS: activity.durationS ?? activity.movingTimeS,
      elevationGainM: activity.elevationGainM,
    })),
    bikes: bikeChoices(
      ctx,
      activities.flatMap((a) => (a.suggestedBikeId == null ? [] : [a.suggestedBikeId])),
    ),
  };
}
