import { describe, expect, it } from "vitest";
import {
  decideAssignment,
  importStartDay,
  isTooShort,
  jwtExpiresAt,
  keyState,
  keyUsable,
  parseGarminUtc,
  retryDelayMs,
  rideFromActivity,
  rideTypeFor,
  toImportedActivity,
  tokenNeedsRefresh,
  type GarminActivitySummary,
} from "./garmin";
import { fakeJwt } from "@/test/garmin";

// Shaped as the owner's real gravel ride of 2026-11-03 (fields and decimals), values made up.
const gravel: GarminActivitySummary = {
  activityId: 10_000_000_001,
  activityName: "Sortie gravel",
  startTimeLocal: "2026-11-02 17:51:37",
  startTimeGMT: "2026-11-02 16:51:37",
  activityType: { typeId: 143, typeKey: "gravel_cycling", parentTypeId: 2 },
  distance: 41798.0703125,
  duration: 5821.75,
  movingDuration: 5807.0,
  elapsedDuration: 5955.68212890625,
  elevationGain: 123.0,
  elevationLoss: 125.0,
  averageSpeed: 7.179999828338623,
  locationName: "Bourg-en-Bresse",
};

describe("jwtExpiresAt", () => {
  it("reads exp (seconds) as epoch milliseconds", () => {
    expect(jwtExpiresAt(fakeJwt({ exp: 1_793_829_278, iat: 1_793_742_878 }))).toBe(
      1_793_829_278_000,
    );
  });

  it("is null for anything that is not a JWT with a numeric exp", () => {
    expect(jwtExpiresAt("not-a-jwt")).toBeNull();
    expect(jwtExpiresAt("a.b.c")).toBeNull();
    expect(jwtExpiresAt(fakeJwt({ iat: 1 }))).toBeNull();
    expect(jwtExpiresAt(fakeJwt({ exp: "tomorrow" }))).toBeNull();
  });

  it("asks for a new token when less than the margin is left", () => {
    const exp = 10_000_000;
    expect(tokenNeedsRefresh(exp, exp - 3_601_000, 3600)).toBe(false);
    expect(tokenNeedsRefresh(exp, exp - 3_600_000, 3600)).toBe(true);
    expect(tokenNeedsRefresh(exp, exp + 1, 3600)).toBe(true);
  });
});

describe("parseGarminUtc", () => {
  it("reads Garmin's zone-less instants as UTC", () => {
    expect(parseGarminUtc("2026-11-02 16:51:37")).toBe(Date.UTC(2026, 10, 2, 16, 51, 37));
    expect(parseGarminUtc("2026-11-02T16:51:37.0")).toBe(Date.UTC(2026, 10, 2, 16, 51, 37));
  });

  it("refuses other shapes and impossible days", () => {
    expect(parseGarminUtc(null)).toBeNull();
    expect(parseGarminUtc("02/11/2026 16:51")).toBeNull();
    expect(parseGarminUtc("2026-02-30 10:00:00")).toBeNull();
  });
});

describe("toImportedActivity", () => {
  it("converts to the app's units, rounding Garmin's decimals", () => {
    const activity = toImportedActivity(gravel);
    expect(activity).toMatchObject({
      externalId: "10000000001",
      startedAt: Date.UTC(2026, 10, 2, 16, 51, 37),
      localDay: "2026-11-02",
      activityType: "gravel_cycling",
      name: "Sortie gravel",
      location: "Bourg-en-Bresse",
      distanceM: 41798,
      durationS: 5822,
      movingTimeS: 5807,
      elapsedTimeS: 5956,
      elevationGainM: 123,
      elevationLossM: 125,
    });
  });

  it("keeps only the listed summary fields", () => {
    const activity = toImportedActivity({
      ...gravel,
      ownerFullName: "Jane Doe",
      startLatitude: 46.2,
    } as GarminActivitySummary);
    expect(activity?.summary).not.toHaveProperty("ownerFullName");
    expect(activity?.summary).not.toHaveProperty("startLatitude");
    expect(activity?.summary.distance).toBe(gravel.distance);
  });

  it("drops what cannot become a ride", () => {
    expect(toImportedActivity({ ...gravel, startTimeGMT: null })).toBeNull();
    expect(toImportedActivity({ ...gravel, activityType: null })).toBeNull();
    expect(toImportedActivity({ ...gravel, duration: 0.2, movingDuration: 0 })).toBeNull();
    expect(toImportedActivity({ ...gravel, activityId: 0 })).toBeNull();
  });

  it("treats a moving time of 0 as none", () => {
    expect(toImportedActivity({ ...gravel, movingDuration: 0 })?.movingTimeS).toBeNull();
  });
});

describe("isTooShort", () => {
  it("filters the stray seconds-long activities", () => {
    const stray = toImportedActivity({
      ...gravel,
      duration: 1.64,
      movingDuration: 1,
      distance: 6.7,
    });
    expect(stray && isTooShort(stray, 60)).toBe(true);
    expect(isTooShort(toImportedActivity(gravel)!, 60)).toBe(false);
    expect(isTooShort({ durationS: 60, movingTimeS: null }, 60)).toBe(false);
  });
});

describe("rides from activities", () => {
  it("maps gravel for sure, anything else to the bike's usual type", () => {
    expect(rideTypeFor("gravel_cycling", "trail")).toBe("gravel");
    expect(rideTypeFor("mountain_biking", "enduro")).toBe("enduro");
  });

  it("fills the ride with the timer time as total and the moving time", () => {
    const ride = rideFromActivity(toImportedActivity(gravel)!, 7, "gravel");
    expect(ride).toMatchObject({
      bikeId: 7,
      startedAt: Date.UTC(2026, 10, 2, 16, 51, 37),
      title: "Sortie gravel",
      location: "Bourg-en-Bresse",
      rideType: "gravel",
      liftAssisted: false,
      distanceM: 41798,
      totalTimeS: 5822,
      movingTimeS: 5807,
      elevationGainM: 123,
      elevationLossM: 125,
    });
  });
});

describe("decideAssignment", () => {
  it("creates the ride on the type's bike", () => {
    expect(decideAssignment({ typeBike: { id: 3, ridden: true }, nearManualRide: false })).toEqual({
      kind: "ride",
      bikeId: 3,
    });
  });

  it("waits when no bike is set, the bike is not ridden, or a typed ride is near", () => {
    expect(decideAssignment({ typeBike: null, nearManualRide: false })).toEqual({
      kind: "pending",
      reason: "no_bike_for_type",
      suggestedBikeId: null,
    });
    expect(decideAssignment({ typeBike: { id: 3, ridden: false }, nearManualRide: false })).toEqual(
      { kind: "pending", reason: "bike_not_ridden", suggestedBikeId: 3 },
    );
    expect(decideAssignment({ typeBike: { id: 3, ridden: true }, nearManualRide: true })).toEqual({
      kind: "pending",
      reason: "possible_duplicate",
      suggestedBikeId: 3,
    });
  });
});

describe("importStartDay", () => {
  it("starts at the first import's day, then a day before the latest activity", () => {
    expect(importStartDay("2026-11-03", null)).toBe("2026-11-03");
    expect(importStartDay("2026-11-03", "2026-11-01")).toBe("2026-11-03");
    expect(importStartDay("2026-11-03", "2026-11-20")).toBe("2026-11-19");
  });
});

describe("keyState", () => {
  const warnDays = [30, 7];
  it("is ok, then warns at 30 and 7 days, then expires the day after", () => {
    expect(
      keyState({ expiresOn: "2027-01-31", rejected: false, today: "2026-11-03", warnDays }),
    ).toEqual({ state: "ok", daysLeft: 89 });
    expect(
      keyState({ expiresOn: "2026-12-03", rejected: false, today: "2026-11-03", warnDays }),
    ).toEqual({ state: "expires_soon", daysLeft: 30, threshold: 30 });
    expect(
      keyState({ expiresOn: "2026-11-10", rejected: false, today: "2026-11-03", warnDays }),
    ).toEqual({ state: "expires_soon", daysLeft: 7, threshold: 7 });
    const lastDay = keyState({
      expiresOn: "2026-11-03",
      rejected: false,
      today: "2026-11-03",
      warnDays,
    });
    expect(lastDay).toEqual({ state: "expires_soon", daysLeft: 0, threshold: 7 });
    expect(keyUsable(lastDay)).toBe(true);
    const expired = keyState({
      expiresOn: "2026-11-02",
      rejected: false,
      today: "2026-11-03",
      warnDays,
    });
    expect(expired).toEqual({ state: "expired", daysLeft: -1 });
    expect(keyUsable(expired)).toBe(false);
  });

  it("is rejected whatever the dates once Garmin refused it", () => {
    const state = keyState({
      expiresOn: "2027-11-03",
      rejected: true,
      today: "2026-11-03",
      warnDays,
    });
    expect(state).toEqual({ state: "rejected" });
    expect(keyUsable(state)).toBe(false);
  });
});

describe("retryDelayMs", () => {
  const base = { now: 0, baseMs: 2000, maxMs: 60_000, random: 0 };
  it("doubles from the base, with jitter, capped", () => {
    expect(retryDelayMs({ ...base, attempt: 1, retryAfter: null })).toBe(2000);
    expect(retryDelayMs({ ...base, attempt: 3, retryAfter: null })).toBe(8000);
    expect(retryDelayMs({ ...base, attempt: 2, retryAfter: null, random: 1 })).toBe(6000);
    expect(retryDelayMs({ ...base, attempt: 10, retryAfter: null })).toBe(60_000);
  });

  it("follows Retry-After in seconds or as a date, capped", () => {
    expect(retryDelayMs({ ...base, attempt: 1, retryAfter: "5" })).toBe(5000);
    expect(retryDelayMs({ ...base, attempt: 1, retryAfter: "600" })).toBe(60_000);
    expect(
      retryDelayMs({
        ...base,
        now: Date.parse("2026-11-03T10:00:00Z"),
        attempt: 1,
        retryAfter: "Tue, 03 Nov 2026 10:00:12 GMT",
      }),
    ).toBe(12_000);
  });
});
