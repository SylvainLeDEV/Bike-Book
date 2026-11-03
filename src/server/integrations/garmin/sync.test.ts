import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/server/auth/secrets";
import {
  createBike,
  createRide,
  getIntegration,
  listAttachments,
  listPendingActivities,
  listRides,
  saveIntegrationKey,
  setActivityTypeBike,
  type AccessContext,
  type BikeData,
} from "@/server/db";
import type { GarminConfig } from "@/server/env";
import { dataPath } from "@/server/files/storage";
import { zip } from "@/server/export/zip";
import { createTestContext } from "@/test/context";
import { BASE_URL, fakeGarmin, garminActivity, pass } from "@/test/garmin";
import { clearGarminTokens } from "./client";
import { GARMIN_KEY_PURPOSE, KEY_EXPIRED_MESSAGE, syncGarmin } from "./sync";

const NOW = Date.parse("2026-11-03T20:00:00Z");

const config: GarminConfig = {
  apiBaseUrl: BASE_URL,
  syncIntervalH: 6,
  minDurationS: 60,
  tokenRefreshMarginS: 3600,
  keyWarnDays: [30, 7],
  downloadFit: false,
};

const bikeData = (name: string, discipline: BikeData["discipline"]): BikeData => ({
  name,
  discipline,
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
});

function setup(name: string, options: { importFrom?: string; keyExpiresOn?: string } = {}) {
  const ctx = createTestContext(name);
  const gravel = createBike(ctx, bikeData("Gravel", "gravel"));
  const mtb = createBike(ctx, bikeData("VTT", "trail"));
  if (!gravel.ok || !mtb.ok) throw new Error("bikes not created");
  saveIntegrationKey(ctx, "garmin", {
    keyCiphertext: encryptSecret("test-key", GARMIN_KEY_PURPOSE),
    keyHint: "-key",
    keyExpiresOn: options.keyExpiresOn ?? "2027-11-03",
    importFrom: options.importFrom ?? "2026-10-01",
  });
  setActivityTypeBike(ctx, "garmin", "gravel_cycling", gravel.bikeId);
  return { ctx, gravelId: gravel.bikeId, mtbId: mtb.bikeId };
}

const sync = (
  ctx: AccessContext,
  fake: ReturnType<typeof fakeGarmin>,
  extra: Partial<GarminConfig> = {},
) => syncGarmin(ctx, { config: { ...config, ...extra }, deps: fake.deps, now: NOW });

beforeEach(() => {
  clearGarminTokens();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("syncGarmin (D-101)", () => {
  it("makes rides of the type's bike, leaves the rest in À classer, skips stray seconds", async () => {
    const { ctx, gravelId, mtbId } = setup("Import");
    const fake = fakeGarmin({
      now: () => NOW,
      activities: [
        garminActivity("2026-10-02 16:51:37"),
        garminActivity("2026-10-03 09:00:00", {
          activityType: { typeId: 5, typeKey: "mountain_biking", parentTypeId: 2 },
        }),
        // Seen on the real account: about a second, 0 m.
        garminActivity("2026-10-04 10:00:00", { duration: 1.23, movingDuration: 0, distance: 0 }),
      ],
    });
    const summary = await sync(ctx, fake);
    expect(summary).toEqual({
      ok: true,
      read: 2,
      imported: 1,
      pending: 1,
      known: 0,
      tooShort: 0,
      fitFiles: 0,
    });

    const [ride] = listRides(ctx, { bikeId: gravelId });
    expect(ride).toMatchObject({
      source: "garmin_api",
      rideType: "gravel",
      startedAt: Date.UTC(2026, 9, 2, 16, 51, 37),
      distanceM: 41798,
      totalTimeS: 5822,
      movingTimeS: 5807,
      elevationGainM: 123,
      elevationLossM: 125,
      title: "Sortie gravel",
      location: "Village",
    });
    expect(listRides(ctx, { bikeId: mtbId })).toHaveLength(0);
    const [pending] = listPendingActivities(ctx, "garmin");
    expect(pending).toMatchObject({
      activityType: "mountain_biking",
      pendingReason: "no_bike_for_type",
    });
    expect(getIntegration(ctx, "garmin")).toMatchObject({ lastError: null, lastSuccessAt: NOW });
  });

  it("can run again without bringing anything twice, and resumes a day before the latest", async () => {
    const { ctx, gravelId } = setup("Again");
    const activities = [
      garminActivity("2026-10-10 08:00:00"),
      garminActivity("2026-10-20 08:00:00"),
    ];
    const fake = fakeGarmin({ now: () => NOW, activities });
    await sync(ctx, fake);
    activities.push(garminActivity("2026-10-25 08:00:00"));
    const second = await sync(ctx, fake);
    expect(second).toMatchObject({ ok: true, imported: 1, known: 1 });
    expect(listRides(ctx, { bikeId: gravelId })).toHaveLength(3);
    const lists = fake.calls.filter((call) => call.path.includes("activitylist"));
    expect(lists[0].params.get("startDate")).toBe("2026-10-01");
    // The latest activity read starts on 2026-10-20 (local): the next import asks from the 19th.
    expect(lists.at(-1)?.params.get("startDate")).toBe("2026-10-19");
  });

  it("starts at the first import's day", async () => {
    const { ctx } = setup("From", { importFrom: "2026-10-15" });
    const fake = fakeGarmin({
      now: () => NOW,
      activities: [garminActivity("2026-10-14 08:00:00"), garminActivity("2026-10-16 08:00:00")],
    });
    expect(await sync(ctx, fake)).toMatchObject({ ok: true, imported: 1 });
  });

  it("leaves an activity near a ride typed by hand in À classer", async () => {
    const { ctx, gravelId } = setup("Duplicate");
    createRide(ctx, {
      bikeId: gravelId,
      startedAt: Date.UTC(2026, 9, 2, 17, 0, 0),
      title: null,
      location: null,
      rideType: "gravel",
      liftAssisted: false,
      distanceM: 42_000,
      descentDistanceM: null,
      totalTimeS: 5800,
      movingTimeS: null,
      descentTimeS: null,
      runsCount: null,
      elevationGainM: null,
      elevationLossM: null,
      conditions: null,
      notes: null,
    });
    const fake = fakeGarmin({
      now: () => NOW,
      activities: [garminActivity("2026-10-02 16:51:37")],
    });
    expect(await sync(ctx, fake)).toMatchObject({ ok: true, imported: 0, pending: 1 });
    expect(listPendingActivities(ctx, "garmin")[0]).toMatchObject({
      pendingReason: "possible_duplicate",
      suggestedBikeId: gravelId,
    });
  });

  it("does not call Garmin once the key's expiry day has passed", async () => {
    const { ctx } = setup("Expired", { keyExpiresOn: "2026-11-02" });
    const fake = fakeGarmin({
      now: () => NOW,
      activities: [garminActivity("2026-10-02 08:00:00")],
    });
    expect(await sync(ctx, fake)).toEqual({ ok: false, reason: "key_expired" });
    expect(fake.calls).toHaveLength(0);
    expect(getIntegration(ctx, "garmin")?.lastError).toBe(KEY_EXPIRED_MESSAGE);
  });

  it("stops on a key Garmin refuses, and waits for a new one", async () => {
    const { ctx } = setup("Refused");
    const fake = fakeGarmin({ now: () => NOW, validKey: "another-key", activities: [] });
    expect(await sync(ctx, fake)).toMatchObject({
      ok: false,
      reason: "garmin",
      kind: "key_rejected",
    });
    expect(getIntegration(ctx, "garmin")).toMatchObject({ status: "key_rejected" });
    expect(getIntegration(ctx, "garmin")?.lastError).toMatch(/invalide, expirée ou révoquée/);
    const calls = fake.calls.length;
    expect(await sync(ctx, fake)).toMatchObject({ ok: false, kind: "key_rejected" });
    expect(fake.calls).toHaveLength(calls);

    // A new key clears the refusal.
    saveIntegrationKey(ctx, "garmin", {
      keyCiphertext: encryptSecret("another-key", GARMIN_KEY_PURPOSE),
      keyHint: "-key",
      keyExpiresOn: "2027-11-03",
      importFrom: "2026-10-01",
    });
    expect(await sync(ctx, fake)).toMatchObject({ ok: true });
  });

  it("keeps what an interrupted import wrote, and records the error", async () => {
    const { ctx, gravelId } = setup("Interrupted");
    const activities = Array.from({ length: 101 }, (_, i) =>
      garminActivity(
        `2026-10-${String(2 + Math.floor(i / 10)).padStart(2, "0")} 08:${String(i % 60).padStart(2, "0")}:00`,
      ),
    );
    const fake = fakeGarmin({
      now: () => NOW,
      activities,
      routes: [
        (call) => (call.params.get("start") === "100" ? new Response("", { status: 503 }) : pass()),
      ],
    });
    expect(await sync(ctx, fake)).toMatchObject({ ok: false, kind: "unavailable" });
    expect(listRides(ctx, { bikeId: gravelId })).toHaveLength(100);
    expect(getIntegration(ctx, "garmin")?.lastError).toMatch(/ne répond pas/);
  });

  it("keeps the FIT file on the ride when asked", async () => {
    const { ctx, gravelId } = setup("Fit");
    const fitBytes = Buffer.alloc(64);
    fitBytes[0] = 14;
    fitBytes.write(".FIT", 8, "latin1");
    const chunks: Uint8Array[] = [];
    for await (const chunk of zip([{ name: "1_ACTIVITY.fit", data: fitBytes }], {
      year: 2026,
      month: 11,
      day: 3,
      hour: 21,
      minute: 0,
      second: 0,
    })) {
      chunks.push(chunk);
    }
    const fake = fakeGarmin({
      now: () => NOW,
      activities: [garminActivity("2026-10-02 08:00:00")],
      routes: [
        (call) =>
          call.path.startsWith("/download-service/") ? new Response(Buffer.concat(chunks)) : pass(),
      ],
    });
    expect(await sync(ctx, fake, { downloadFit: true })).toMatchObject({ ok: true, fitFiles: 1 });
    const [ride] = listRides(ctx, { bikeId: gravelId });
    const [file] = listAttachments(ctx, { kind: "ride", id: ride.id }) ?? [];
    expect(file).toMatchObject({
      mimeType: "application/vnd.ant.fit",
      kind: "other",
      sizeBytes: 64,
    });
    expect(existsSync(dataPath(file.storagePath))).toBe(true);
  });
});
