import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import type { RideConditions, RideSource, RideType } from "@/lib/enums";
import type { RideUsage } from "@/server/domain/wear";
import type { AccessContext } from "./access-context";
import { getDb } from "./client";
import { bikes, rides } from "./schema";

// Rides of the workspace's bikes; they inherit the workspace through `bike_id` (D-25).

export type Ride = RideUsage & {
  bikeId: number;
  title: string | null;
  location: string | null;
  rideType: RideType;
  runsCount: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
  conditions: RideConditions | null;
  notes: string | null;
  source: RideSource;
};

export type RideData = Omit<Ride, "id" | "source">;

const rideColumns = {
  id: rides.id,
  bikeId: rides.bikeId,
  startedAt: rides.startedAt,
  title: rides.title,
  location: rides.location,
  rideType: rides.rideType,
  liftAssisted: rides.liftAssisted,
  distanceM: rides.distanceM,
  descentDistanceM: rides.descentDistanceM,
  totalTimeS: rides.totalTimeS,
  movingTimeS: rides.movingTimeS,
  descentTimeS: rides.descentTimeS,
  runsCount: rides.runsCount,
  elevationGainM: rides.elevationGainM,
  elevationLossM: rides.elevationLossM,
  conditions: rides.conditions,
  notes: rides.notes,
  source: rides.source,
};

/**
 * Rides of the workspace, newest first: one bike's (`bikeId`) or all bikes', the latest `limit`.
 */
export function listRides(
  ctx: AccessContext,
  options: { bikeId?: number; limit?: number } = {},
): Ride[] {
  const query = getDb()
    .select(rideColumns)
    .from(rides)
    .innerJoin(bikes, eq(bikes.id, rides.bikeId))
    .where(
      and(
        eq(bikes.workspaceId, ctx.workspace.id),
        options.bikeId == null ? undefined : eq(rides.bikeId, options.bikeId),
      ),
    )
    .orderBy(desc(rides.startedAt), desc(rides.id));
  const rows = options.limit == null ? query.all() : query.limit(options.limit).all();
  return rows.map((row) => ({ ...row, startedAt: row.startedAt.getTime() }));
}

/** The rides of one bike in time order, as the wear engine needs them. */
export function listRideUsages(ctx: AccessContext, bikeId: number): RideUsage[] {
  return getDb()
    .select({
      id: rides.id,
      startedAt: rides.startedAt,
      liftAssisted: rides.liftAssisted,
      distanceM: rides.distanceM,
      descentDistanceM: rides.descentDistanceM,
      totalTimeS: rides.totalTimeS,
      movingTimeS: rides.movingTimeS,
      descentTimeS: rides.descentTimeS,
    })
    .from(rides)
    .innerJoin(bikes, eq(bikes.id, rides.bikeId))
    .where(and(eq(bikes.workspaceId, ctx.workspace.id), eq(rides.bikeId, bikeId)))
    .orderBy(asc(rides.startedAt), asc(rides.id))
    .all()
    .map((row) => ({ ...row, startedAt: row.startedAt.getTime() }));
}

/** Adds a ride to a bike of the workspace. */
export function createRide(
  ctx: AccessContext,
  data: RideData,
): { ok: true; rideId: number } | { ok: false; reason: "not_found" } {
  return getDb().transaction((tx) => {
    const owned = tx
      .select({ id: bikes.id })
      .from(bikes)
      .where(and(eq(bikes.id, data.bikeId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get();
    if (!owned) return { ok: false, reason: "not_found" };
    const { id } = tx
      .insert(rides)
      .values({ ...data, startedAt: new Date(data.startedAt), source: "manual" })
      .returning({ id: rides.id })
      .get();
    return { ok: true, rideId: id };
  });
}

/** Undoes "Sortie ajoutée" (D-60): deletes that ride of the workspace, entered by hand. */
export function undoCreateRide(
  ctx: AccessContext,
  rideId: number,
): { ok: true } | { ok: false; reason: "not_found" } {
  return getDb().transaction((tx) => {
    const ride = tx
      .select({ id: rides.id, source: rides.source })
      .from(rides)
      .innerJoin(bikes, eq(bikes.id, rides.bikeId))
      .where(and(eq(rides.id, rideId), eq(bikes.workspaceId, ctx.workspace.id)))
      .get();
    if (!ride || ride.source !== "manual") return { ok: false, reason: "not_found" };
    tx.delete(rides).where(eq(rides.id, ride.id)).run();
    return { ok: true };
  });
}
