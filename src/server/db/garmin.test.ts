import { describe, expect, it } from "vitest";
import { toImportedActivity } from "@/server/domain/garmin";
import { createTestContext } from "@/test/context";
import { garminActivity } from "@/test/garmin";
import { getDb } from "./client";
import {
  assignPendingActivity,
  countPendingActivities,
  createBike,
  createRide,
  deleteIntegration,
  getIntegration,
  ignorePendingActivity,
  importActivity,
  linkPendingActivity,
  listActivityTypeBikes,
  listIgnoredActivities,
  listPendingActivities,
  listRides,
  listSeenActivityTypes,
  listSyncTargets,
  restoreIgnoredActivity,
  saveIntegrationKey,
  setActivityTypeBike,
  updateIntegrationDates,
  type BikeData,
} from "./index";
import { integrations } from "./schema";

const bike: BikeData = {
  name: "Gravel",
  discipline: "gravel",
  isElectric: false,
  brand: null,
  model: null,
  modelYear: null,
  frameSize: null,
  wheelSize: null,
  color: null,
  frameSerial: null,
  weightG: null,
  purchasedOn: null,
  purchasePriceCents: null,
  purchaseShop: null,
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
  status: "active",
  statusChangedOn: null,
  salePriceCents: null,
  notes: null,
};

function setup(name: string) {
  const ctx = createTestContext(name);
  const created = createBike(ctx, bike);
  if (!created.ok) throw new Error("bike");
  return { ctx, bikeId: created.bikeId };
}

const activity = (start: string, typeKey = "gravel_cycling") =>
  toImportedActivity(
    garminActivity(start, { activityType: { typeId: 1, typeKey, parentTypeId: 2 } }),
  )!;

const ride = (bikeId: number, startedAt: number) => ({
  bikeId,
  startedAt,
  title: null,
  location: null,
  rideType: "gravel" as const,
  liftAssisted: false,
  distanceM: 1000,
  descentDistanceM: null,
  totalTimeS: 600,
  movingTimeS: null,
  descentTimeS: null,
  runsCount: null,
  elevationGainM: null,
  elevationLossM: null,
  conditions: null,
  notes: null,
});

describe("Garmin data access (D-101)", () => {
  it("keeps one link per user and workspace, its key encrypted by the caller", () => {
    const { ctx } = setup("Link");
    expect(getIntegration(ctx, "garmin")).toBeNull();
    const data = {
      keyCiphertext: "v1.a.b.c",
      keyHint: "abcd",
      keyExpiresOn: "2027-01-01",
      importFrom: "2026-11-03",
    };
    saveIntegrationKey(ctx, "garmin", data);
    saveIntegrationKey(ctx, "garmin", { ...data, keyHint: "wxyz" });
    expect(
      getDb()
        .select()
        .from(integrations)
        .all()
        .filter((row) => row.userId === ctx.user.id),
    ).toHaveLength(1);
    expect(getIntegration(ctx, "garmin")).toMatchObject({ keyHint: "wxyz", status: "active" });
    expect(
      updateIntegrationDates(ctx, "garmin", {
        keyExpiresOn: "2027-02-01",
        importFrom: "2026-10-01",
      }),
    ).toBe(true);
    expect(getIntegration(ctx, "garmin")?.keyExpiresOn).toBe("2027-02-01");
    expect(listSyncTargets("garmin").some((t) => t.ctx.user.id === ctx.user.id)).toBe(true);
    expect(deleteIntegration(ctx, "garmin")).toBe(true);
    expect(getIntegration(ctx, "garmin")).toBeNull();
  });

  it("sets a type's bike in the workspace only", () => {
    const { ctx, bikeId } = setup("Types");
    const other = setup("Other types");
    expect(setActivityTypeBike(ctx, "garmin", "gravel_cycling", other.bikeId)).toBe(false);
    expect(setActivityTypeBike(ctx, "garmin", "gravel_cycling", bikeId)).toBe(true);
    expect(listActivityTypeBikes(ctx, "garmin").get("gravel_cycling")).toBe(bikeId);
    expect(listActivityTypeBikes(other.ctx, "garmin").size).toBe(0);
    expect(setActivityTypeBike(ctx, "garmin", "gravel_cycling", null)).toBe(true);
    expect(listActivityTypeBikes(ctx, "garmin").size).toBe(0);
  });

  it("imports an activity once, as a ride or waiting", () => {
    const { ctx, bikeId } = setup("Import");
    const a = activity("2026-10-02 08:00:00");
    const outcome = importActivity(ctx, "garmin", a, {
      kind: "ride",
      ride: ride(bikeId, a.startedAt),
    });
    expect(outcome).toMatchObject({ ok: true });
    expect(
      importActivity(ctx, "garmin", a, {
        kind: "pending",
        reason: "no_bike_for_type",
        suggestedBikeId: null,
      }),
    ).toEqual({
      ok: false,
      reason: "duplicate",
    });
    expect(listRides(ctx, { bikeId })[0].source).toBe("garmin_api");
    const b = activity("2026-10-03 08:00:00", "mountain_biking");
    importActivity(ctx, "garmin", b, {
      kind: "pending",
      reason: "no_bike_for_type",
      suggestedBikeId: null,
    });
    expect(countPendingActivities(ctx)).toBe(1);
    expect(
      listSeenActivityTypes(ctx, "garmin")
        .map((t) => t.activityType)
        .sort(),
    ).toEqual(["gravel_cycling", "mountain_biking"]);
  });

  it("imports, links or ignores a waiting activity, in its workspace only", () => {
    const { ctx, bikeId } = setup("Inbox");
    const other = setup("Other inbox");
    const wait = (start: string) => {
      const a = activity(start);
      const outcome = importActivity(ctx, "garmin", a, {
        kind: "pending",
        reason: "possible_duplicate",
        suggestedBikeId: bikeId,
      });
      if (!outcome.ok) throw new Error("import");
      return { id: outcome.externalActivityId, a };
    };

    const first = wait("2026-10-04 08:00:00");
    expect(
      assignPendingActivity(other.ctx, first.id, ride(other.bikeId, first.a.startedAt)).ok,
    ).toBe(false);
    expect(assignPendingActivity(ctx, first.id, ride(bikeId, first.a.startedAt))).toMatchObject({
      ok: true,
    });
    expect(assignPendingActivity(ctx, first.id, ride(bikeId, first.a.startedAt)).ok).toBe(false);

    const second = wait("2026-10-05 08:00:00");
    const typed = createRide(ctx, ride(bikeId, second.a.startedAt + 60_000));
    if (!typed.ok) throw new Error("ride");
    expect(linkPendingActivity(ctx, second.id, typed.rideId)).toEqual({
      ok: true,
      rideId: typed.rideId,
    });

    const third = wait("2026-10-06 08:00:00");
    expect(ignorePendingActivity(other.ctx, third.id).ok).toBe(false);
    expect(ignorePendingActivity(ctx, third.id).ok).toBe(true);

    expect(listPendingActivities(ctx, "garmin")).toHaveLength(0);
    // One ride typed, one imported: the linked activity added none.
    expect(listRides(ctx, { bikeId })).toHaveLength(2);
  });

  it("keeps ignored activities and puts them back in À classer", () => {
    const { ctx, bikeId } = setup("Restore");
    const other = setup("Other restore");
    const a = activity("2026-10-07 08:00:00", "mountain_biking");
    const outcome = importActivity(ctx, "garmin", a, {
      kind: "pending",
      reason: "no_bike_for_type",
      suggestedBikeId: null,
    });
    if (!outcome.ok) throw new Error("import");
    ignorePendingActivity(ctx, outcome.externalActivityId);
    expect(listIgnoredActivities(ctx, "garmin").map((x) => x.id)).toEqual([
      outcome.externalActivityId,
    ]);
    expect(listIgnoredActivities(other.ctx, "garmin")).toHaveLength(0);

    // Another workspace's activity or bike is refused.
    expect(restoreIgnoredActivity(other.ctx, outcome.externalActivityId, null).ok).toBe(false);
    expect(restoreIgnoredActivity(ctx, outcome.externalActivityId, other.bikeId)).toEqual({
      ok: true,
      rideId: null,
    });
    expect(listPendingActivities(ctx, "garmin")[0]).toMatchObject({
      pendingReason: "restored",
      suggestedBikeId: null,
    });
    expect(listIgnoredActivities(ctx, "garmin")).toHaveLength(0);
    // Already back: a second restore finds nothing to do; the activity can be imported.
    expect(restoreIgnoredActivity(ctx, outcome.externalActivityId, bikeId).ok).toBe(false);
    expect(
      assignPendingActivity(ctx, outcome.externalActivityId, ride(bikeId, a.startedAt)).ok,
    ).toBe(true);
  });
});
