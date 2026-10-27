import { describe, expect, it } from "vitest";
import { eventInstant, rideStartInstant } from "./time";

const PARIS = "Europe/Paris";
const iso = (ms: number) => new Date(ms).toISOString();

describe("dated events (D-61)", () => {
  it("uses the moment it was recorded when dated that day", () => {
    const recordedAt = Date.parse("2026-10-25T17:30:00Z");
    expect(eventInstant("2026-10-25", recordedAt, PARIS)).toBe(recordedAt);
  });

  it("puts a past-dated event at the end of its day, clock change included", () => {
    const recordedAt = Date.parse("2026-10-27T08:00:00Z");
    expect(iso(eventInstant("2026-10-25", recordedAt, PARIS))).toBe("2026-10-25T22:59:59.999Z");
    expect(iso(eventInstant("2026-03-29", recordedAt, PARIS))).toBe("2026-03-29T21:59:59.999Z");
  });

  it("compares local days, not UTC days", () => {
    // 23:30 in Paris on 25 October is already 26 October nowhere else but still 25 here.
    const lateEvening = Date.parse("2026-10-25T22:30:00Z");
    expect(eventInstant("2026-10-25", lateEvening, PARIS)).toBe(lateEvening);
  });
});

describe("ride start (D-61)", () => {
  it("starts at noon local time unless a time is given", () => {
    expect(iso(rideStartInstant("2026-10-25", null, PARIS))).toBe("2026-10-25T11:00:00.000Z");
    expect(iso(rideStartInstant("2026-07-14", { hour: 9, minute: 15 }, PARIS))).toBe(
      "2026-07-14T07:15:00.000Z",
    );
  });

  it("keeps a morning ride of a past replacement day on the old part", () => {
    const ride = rideStartInstant("2026-09-15", null, PARIS);
    const fitted = eventInstant("2026-09-15", Date.parse("2026-10-01T10:00:00Z"), PARIS);
    expect(ride).toBeLessThan(fitted);
  });
});
