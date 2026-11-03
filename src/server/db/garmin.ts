import "server-only";
import { and, asc, count, desc, eq, inArray, max } from "drizzle-orm";
import type {
  ExternalActivityStatus,
  IntegrationProvider,
  IntegrationStatus,
  PendingReason,
  RideType,
} from "@/lib/enums";
import type { ImportedActivity } from "@/server/domain/garmin";
import type { AccessContext } from "./access-context";
import { getDb, type Tx } from "./client";
import type { RideData } from "./rides";
import {
  activityTypeBikes,
  bikes,
  externalActivities,
  integrations,
  memberships,
  rides,
  users,
  workspaces,
} from "./schema";

// Activity imports (phase 2, D-101): a user's link to a provider in a workspace, the activities
// read from it ("À classer" while they wait) and the bike of each activity type. Everything is
// scoped by the access context; the scheduler gets one per integration from `listSyncTargets`.

export type Integration = {
  id: number;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  /** Server-side only: never sent to the browser (views keep `keyHint`). */
  keyCiphertext: string;
  keyHint: string;
  keyExpiresOn: string;
  keySavedAt: number;
  importFrom: string;
  lastSyncAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
};

const integrationColumns = {
  id: integrations.id,
  provider: integrations.provider,
  status: integrations.status,
  keyCiphertext: integrations.keyCiphertext,
  keyHint: integrations.keyHint,
  keyExpiresOn: integrations.keyExpiresOn,
  keySavedAt: integrations.keySavedAt,
  importFrom: integrations.importFrom,
  lastSyncAt: integrations.lastSyncAt,
  lastSuccessAt: integrations.lastSuccessAt,
  lastError: integrations.lastError,
};

const ms = (date: Date | null) => (date ? date.getTime() : null);

function toIntegration(row: {
  [K in keyof typeof integrationColumns]: unknown;
}): Integration {
  const r = row as Omit<Integration, "keySavedAt" | "lastSyncAt" | "lastSuccessAt"> & {
    keySavedAt: Date;
    lastSyncAt: Date | null;
    lastSuccessAt: Date | null;
  };
  return {
    ...r,
    keySavedAt: r.keySavedAt.getTime(),
    lastSyncAt: ms(r.lastSyncAt),
    lastSuccessAt: ms(r.lastSuccessAt),
  };
}

const ownIntegration = (ctx: AccessContext, provider: IntegrationProvider) =>
  and(
    eq(integrations.userId, ctx.user.id),
    eq(integrations.workspaceId, ctx.workspace.id),
    eq(integrations.provider, provider),
  );

/** The current user's link to a provider in the current workspace, or null. */
export function getIntegration(
  ctx: AccessContext,
  provider: IntegrationProvider,
): Integration | null {
  const row = getDb()
    .select(integrationColumns)
    .from(integrations)
    .where(ownIntegration(ctx, provider))
    .get();
  return row ? toIntegration(row) : null;
}

/**
 * Saves a new key (encrypted by the caller) with its expiry date and the first import's day:
 * creates the link or replaces its key. A new key clears a refusal and the last error.
 */
export function saveIntegrationKey(
  ctx: AccessContext,
  provider: IntegrationProvider,
  data: { keyCiphertext: string; keyHint: string; keyExpiresOn: string; importFrom: string },
  now = new Date(),
): void {
  const values = { ...data, status: "active" as const, keySavedAt: now, lastError: null };
  getDb()
    .insert(integrations)
    .values({ ...values, userId: ctx.user.id, workspaceId: ctx.workspace.id, provider })
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.workspaceId, integrations.provider],
      set: values,
    })
    .run();
}

/** Changes the key's expiry date or the first import's day, without typing the key again. */
export function updateIntegrationDates(
  ctx: AccessContext,
  provider: IntegrationProvider,
  data: { keyExpiresOn: string; importFrom: string },
): boolean {
  const result = getDb().update(integrations).set(data).where(ownIntegration(ctx, provider)).run();
  return result.changes > 0;
}

/** "Déconnecter": the key goes; the activities already read and their rides stay. */
export function deleteIntegration(ctx: AccessContext, provider: IntegrationProvider): boolean {
  return getDb().delete(integrations).where(ownIntegration(ctx, provider)).run().changes > 0;
}

/** Records how an import ended: a success clears the error; a refused key stops the next ones. */
export function recordSyncOutcome(
  ctx: AccessContext,
  provider: IntegrationProvider,
  outcome: { at: Date; ok: boolean; error: string | null; keyRejected: boolean },
): void {
  getDb()
    .update(integrations)
    .set({
      lastSyncAt: outcome.at,
      ...(outcome.ok
        ? { lastSuccessAt: outcome.at, lastError: null }
        : { lastError: outcome.error }),
      ...(outcome.keyRejected ? { status: "key_rejected" as const } : {}),
    })
    .where(ownIntegration(ctx, provider))
    .run();
}

/**
 * Every link to a provider whose user is still a member of its workspace, with the access
 * context the scheduled import acts in (as a personal token does, D-90).
 */
export function listSyncTargets(
  provider: IntegrationProvider,
): { ctx: AccessContext; integration: Integration }[] {
  return getDb()
    .select({
      ...integrationColumns,
      userId: users.id,
      userEmail: users.email,
      userName: users.name,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      role: memberships.role,
    })
    .from(integrations)
    .innerJoin(users, eq(users.id, integrations.userId))
    .innerJoin(workspaces, eq(workspaces.id, integrations.workspaceId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, integrations.userId),
        eq(memberships.workspaceId, integrations.workspaceId),
      ),
    )
    .where(eq(integrations.provider, provider))
    .orderBy(asc(integrations.id))
    .all()
    .map(({ userId, userEmail, userName, workspaceId, workspaceName, role, ...row }) => ({
      ctx: {
        user: { id: userId, email: userEmail, name: userName },
        workspace: { id: workspaceId, name: workspaceName },
        role,
      },
      integration: toIntegration(row),
    }));
}

// --- Activity types → bikes -----------------------------------------------------------------------

/** The bike set for each activity type of a provider. */
export function listActivityTypeBikes(
  ctx: AccessContext,
  provider: IntegrationProvider,
): Map<string, number> {
  const rows = getDb()
    .select({ activityType: activityTypeBikes.activityType, bikeId: activityTypeBikes.bikeId })
    .from(activityTypeBikes)
    .where(
      and(
        eq(activityTypeBikes.workspaceId, ctx.workspace.id),
        eq(activityTypeBikes.provider, provider),
      ),
    )
    .all();
  return new Map(rows.map((row) => [row.activityType, row.bikeId]));
}

/** Sets the bike of an activity type, or clears it (`bikeId` null). False for another workspace's bike. */
export function setActivityTypeBike(
  ctx: AccessContext,
  provider: IntegrationProvider,
  activityType: string,
  bikeId: number | null,
): boolean {
  return getDb().transaction((tx) => {
    const scope = and(
      eq(activityTypeBikes.workspaceId, ctx.workspace.id),
      eq(activityTypeBikes.provider, provider),
      eq(activityTypeBikes.activityType, activityType),
    );
    if (bikeId == null) {
      tx.delete(activityTypeBikes).where(scope).run();
      return true;
    }
    const owned = tx
      .select({ id: bikes.id })
      .from(bikes)
      .where(and(eq(bikes.id, bikeId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get();
    if (!owned) return false;
    tx.insert(activityTypeBikes)
      .values({ workspaceId: ctx.workspace.id, provider, activityType, bikeId })
      .onConflictDoUpdate({
        target: [
          activityTypeBikes.workspaceId,
          activityTypeBikes.provider,
          activityTypeBikes.activityType,
        ],
        set: { bikeId },
      })
      .run();
    return true;
  });
}

/** The activity types read so far, most frequent first, with how many activities each. */
export function listSeenActivityTypes(
  ctx: AccessContext,
  provider: IntegrationProvider,
): { activityType: string; count: number }[] {
  return getDb()
    .select({ activityType: externalActivities.activityType, count: count() })
    .from(externalActivities)
    .where(
      and(
        eq(externalActivities.workspaceId, ctx.workspace.id),
        eq(externalActivities.provider, provider),
      ),
    )
    .groupBy(externalActivities.activityType)
    .orderBy(desc(count()), asc(externalActivities.activityType))
    .all();
}

// --- Imported activities -------------------------------------------------------------------------

const ownActivities = (ctx: AccessContext, provider: IntegrationProvider) =>
  and(
    eq(externalActivities.workspaceId, ctx.workspace.id),
    eq(externalActivities.provider, provider),
  );

/** The start of the latest activity read from a provider, or null before the first import. */
export function latestActivityStart(
  ctx: AccessContext,
  provider: IntegrationProvider,
): number | null {
  const row = getDb()
    .select({ latest: max(externalActivities.startedAt) })
    .from(externalActivities)
    .where(ownActivities(ctx, provider))
    .get();
  return row?.latest ? row.latest.getTime() : null;
}

/** Which of these provider ids were already read (an import never brings one twice). */
export function knownExternalIds(
  ctx: AccessContext,
  provider: IntegrationProvider,
  externalIds: string[],
): Set<string> {
  if (externalIds.length === 0) return new Set();
  const rows = getDb()
    .select({ externalId: externalActivities.externalId })
    .from(externalActivities)
    .where(and(ownActivities(ctx, provider), inArray(externalActivities.externalId, externalIds)))
    .all();
  return new Set(rows.map((row) => row.externalId));
}

/** The ride an activity becomes: the ride table's columns, `source` set by the import. */
export type ImportedRideData = Omit<RideData, "rideType"> & { rideType: RideType };

export type ImportOutcome =
  | { ok: true; externalActivityId: number; rideId: number | null }
  | { ok: false; reason: "duplicate" | "not_found" };

/**
 * Records one activity read from a provider, in one transaction: as a ride of its bike
 * (`source = garmin_api`), or waiting in "À classer" with its reason. An activity already read
 * is left alone (`duplicate`), so an import can run again safely.
 */
export function importActivity(
  ctx: AccessContext,
  provider: IntegrationProvider,
  activity: ImportedActivity,
  target:
    | { kind: "ride"; ride: ImportedRideData }
    | { kind: "pending"; reason: PendingReason; suggestedBikeId: number | null },
): ImportOutcome {
  return getDb().transaction((tx) => {
    const exists = tx
      .select({ id: externalActivities.id })
      .from(externalActivities)
      .where(
        and(ownActivities(ctx, provider), eq(externalActivities.externalId, activity.externalId)),
      )
      .get();
    if (exists) return { ok: false, reason: "duplicate" };

    let rideId: number | null = null;
    if (target.kind === "ride") {
      const owned = tx
        .select({ id: bikes.id })
        .from(bikes)
        .where(and(eq(bikes.id, target.ride.bikeId), eq(bikes.workspaceId, ctx.workspace.id)))
        .get();
      if (!owned) return { ok: false, reason: "not_found" };
      rideId = tx
        .insert(rides)
        .values({
          ...target.ride,
          startedAt: new Date(target.ride.startedAt),
          source: "garmin_api",
        })
        .returning({ id: rides.id })
        .get().id;
    }
    const suggested =
      target.kind === "pending" && target.suggestedBikeId != null
        ? (tx
            .select({ id: bikes.id })
            .from(bikes)
            .where(
              and(eq(bikes.id, target.suggestedBikeId), eq(bikes.workspaceId, ctx.workspace.id)),
            )
            .get()?.id ?? null)
        : null;
    const { id } = tx
      .insert(externalActivities)
      .values({
        workspaceId: ctx.workspace.id,
        provider,
        externalId: activity.externalId,
        startedAt: new Date(activity.startedAt),
        activityType: activity.activityType,
        name: activity.name,
        location: activity.location,
        distanceM: activity.distanceM,
        durationS: activity.durationS,
        movingTimeS: activity.movingTimeS,
        elapsedTimeS: activity.elapsedTimeS,
        elevationGainM: activity.elevationGainM,
        elevationLossM: activity.elevationLossM,
        summaryJson: activity.summary,
        status: target.kind === "ride" ? "assigned" : "new",
        pendingReason: target.kind === "pending" ? target.reason : null,
        suggestedBikeId: target.kind === "ride" ? target.ride.bikeId : suggested,
        rideId,
      })
      .returning({ id: externalActivities.id })
      .get();
    return { ok: true, externalActivityId: id, rideId };
  });
}

export type ExternalActivity = Omit<ImportedActivity, "localDay" | "summary"> & {
  id: number;
  provider: IntegrationProvider;
  status: ExternalActivityStatus;
  pendingReason: PendingReason | null;
  suggestedBikeId: number | null;
  rideId: number | null;
};

const activityColumns = {
  id: externalActivities.id,
  provider: externalActivities.provider,
  externalId: externalActivities.externalId,
  startedAt: externalActivities.startedAt,
  activityType: externalActivities.activityType,
  name: externalActivities.name,
  location: externalActivities.location,
  distanceM: externalActivities.distanceM,
  durationS: externalActivities.durationS,
  movingTimeS: externalActivities.movingTimeS,
  elapsedTimeS: externalActivities.elapsedTimeS,
  elevationGainM: externalActivities.elevationGainM,
  elevationLossM: externalActivities.elevationLossM,
  status: externalActivities.status,
  pendingReason: externalActivities.pendingReason,
  suggestedBikeId: externalActivities.suggestedBikeId,
  rideId: externalActivities.rideId,
};

/** The activities waiting in "À classer", newest first. */
export function listPendingActivities(
  ctx: AccessContext,
  provider: IntegrationProvider,
): ExternalActivity[] {
  return getDb()
    .select(activityColumns)
    .from(externalActivities)
    .where(and(ownActivities(ctx, provider), eq(externalActivities.status, "new")))
    .orderBy(desc(externalActivities.startedAt), desc(externalActivities.id))
    .all()
    .map((row) => ({ ...row, startedAt: row.startedAt.getTime() }));
}

/** How many activities wait in "À classer", every provider together. */
export function countPendingActivities(ctx: AccessContext): number {
  return (
    getDb()
      .select({ count: count() })
      .from(externalActivities)
      .where(
        and(
          eq(externalActivities.workspaceId, ctx.workspace.id),
          eq(externalActivities.status, "new"),
        ),
      )
      .get()?.count ?? 0
  );
}

/** One activity of the workspace, or null. */
export function getExternalActivity(ctx: AccessContext, id: number): ExternalActivity | null {
  const row = getDb()
    .select(activityColumns)
    .from(externalActivities)
    .where(and(eq(externalActivities.id, id), eq(externalActivities.workspaceId, ctx.workspace.id)))
    .get();
  return row ? { ...row, startedAt: row.startedAt.getTime() } : null;
}

type PendingOutcome = { ok: true; rideId: number | null } | { ok: false; reason: "not_found" };

/** The waiting activity, locked by the transaction, or null when it is gone or no longer waiting. */
function pendingIn(tx: Tx, ctx: AccessContext, id: number) {
  return tx
    .select({ id: externalActivities.id })
    .from(externalActivities)
    .where(
      and(
        eq(externalActivities.id, id),
        eq(externalActivities.workspaceId, ctx.workspace.id),
        eq(externalActivities.status, "new"),
      ),
    )
    .get();
}

/** "Importer" in "À classer": the activity becomes a ride of the bike chosen. */
export function assignPendingActivity(
  ctx: AccessContext,
  id: number,
  ride: ImportedRideData,
): PendingOutcome {
  return getDb().transaction((tx) => {
    const pending = pendingIn(tx, ctx, id);
    const owned = tx
      .select({ id: bikes.id })
      .from(bikes)
      .where(and(eq(bikes.id, ride.bikeId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get();
    if (!pending || !owned) return { ok: false, reason: "not_found" };
    const rideId = tx
      .insert(rides)
      .values({ ...ride, startedAt: new Date(ride.startedAt), source: "garmin_api" })
      .returning({ id: rides.id })
      .get().id;
    tx.update(externalActivities)
      .set({ status: "assigned", pendingReason: null, rideId, suggestedBikeId: ride.bikeId })
      .where(eq(externalActivities.id, pending.id))
      .run();
    return { ok: true, rideId };
  });
}

/**
 * "C'est la même sortie": the activity is the ride typed by hand; it is linked to it and no ride
 * is added. The typed ride stays as it is.
 */
export function linkPendingActivity(
  ctx: AccessContext,
  id: number,
  rideId: number,
): PendingOutcome {
  return getDb().transaction((tx) => {
    const pending = pendingIn(tx, ctx, id);
    const ride = tx
      .select({ id: rides.id })
      .from(rides)
      .innerJoin(bikes, eq(bikes.id, rides.bikeId))
      .where(and(eq(rides.id, rideId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get();
    if (!pending || !ride) return { ok: false, reason: "not_found" };
    tx.update(externalActivities)
      .set({ status: "assigned", pendingReason: null, rideId: ride.id })
      .where(eq(externalActivities.id, pending.id))
      .run();
    return { ok: true, rideId: ride.id };
  });
}

/** "Ignorer": the activity leaves "À classer" and is never imported again. */
export function ignorePendingActivity(ctx: AccessContext, id: number): PendingOutcome {
  return getDb().transaction((tx) => {
    const pending = pendingIn(tx, ctx, id);
    if (!pending) return { ok: false, reason: "not_found" };
    tx.update(externalActivities)
      .set({ status: "ignored", pendingReason: null })
      .where(eq(externalActivities.id, pending.id))
      .run();
    return { ok: true, rideId: null };
  });
}

/** The activities "Ignorer" set aside, newest first. */
export function listIgnoredActivities(
  ctx: AccessContext,
  provider: IntegrationProvider,
): ExternalActivity[] {
  return getDb()
    .select(activityColumns)
    .from(externalActivities)
    .where(and(ownActivities(ctx, provider), eq(externalActivities.status, "ignored")))
    .orderBy(desc(externalActivities.startedAt), desc(externalActivities.id))
    .all()
    .map((row) => ({ ...row, startedAt: row.startedAt.getTime() }));
}

/**
 * "Remettre à classer": an ignored activity waits in "À classer" again, its type's bike offered
 * first (`suggestedBikeId`, checked against the workspace). Nothing is asked from the provider:
 * the activity was stored when it was read.
 */
export function restoreIgnoredActivity(
  ctx: AccessContext,
  id: number,
  suggestedBikeId: number | null,
): PendingOutcome {
  return getDb().transaction((tx) => {
    const ignored = tx
      .select({ id: externalActivities.id })
      .from(externalActivities)
      .where(
        and(
          eq(externalActivities.id, id),
          eq(externalActivities.workspaceId, ctx.workspace.id),
          eq(externalActivities.status, "ignored"),
        ),
      )
      .get();
    if (!ignored) return { ok: false, reason: "not_found" };
    const bike =
      suggestedBikeId == null
        ? null
        : (tx
            .select({ id: bikes.id })
            .from(bikes)
            .where(and(eq(bikes.id, suggestedBikeId), eq(bikes.workspaceId, ctx.workspace.id)))
            .get()?.id ?? null);
    tx.update(externalActivities)
      .set({ status: "new", pendingReason: "restored", suggestedBikeId: bike })
      .where(eq(externalActivities.id, ignored.id))
      .run();
    return { ok: true, rideId: null };
  });
}
