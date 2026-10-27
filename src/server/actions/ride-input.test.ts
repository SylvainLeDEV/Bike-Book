import { describe, expect, it } from "vitest";
import type { QuickRideInput } from "@/lib/view-models";
import { quickRideSchema, toRideData } from "./ride-input";

const TODAY = "2026-10-25";
const trail: QuickRideInput = {
  bikeId: 1,
  on: "2026-10-24",
  rideType: "trail",
  durationS: 9000,
  totalTimeS: null,
  descentTimeS: null,
  runsCount: null,
  distanceM: 38_000,
  elevationGainM: 1620,
  conditions: "dry",
  location: "  Massif des Bauges ",
  notes: "",
  startTime: null,
};
const park: QuickRideInput = {
  ...trail,
  rideType: "bike_park",
  durationS: null,
  totalTimeS: 6 * 3600,
  descentTimeS: 2 * 3600 + 600,
  runsCount: 14,
};

const parse = (input: unknown) => quickRideSchema(TODAY).safeParse(input);
const error = (input: unknown) => {
  const result = parse(input);
  return result.success ? null : result.error.issues[0]?.message;
};

describe("quick ride input", () => {
  it("requires one duration, the day's total on a bike park day", () => {
    expect(error({ ...trail, durationS: null })).toBe("Indique une durée, même approximative.");
    expect(error({ ...park, totalTimeS: null })).toBe("Indique une durée, même approximative.");
    expect(error({ ...park, descentTimeS: 7 * 3600 })).toBe(
      "Le temps de descente ne peut pas dépasser le temps total.",
    );
  });

  it("refuses the future, negative figures and odd times", () => {
    expect(error({ ...trail, on: "2026-10-26" })).toBe("La date ne peut pas être dans le futur.");
    expect(error({ ...trail, distanceM: -5 })).toBe("Distance invalide.");
    expect(error({ ...trail, startTime: "25:00" })).toBe("Heure invalide.");
  });

  it("stores the single duration as the total time, at noon unless a time is given", () => {
    const parsed = parse(trail);
    if (!parsed.success) throw new Error("expected valid");
    const data = toRideData(parsed.data, "Europe/Paris");
    expect(data).toMatchObject({
      totalTimeS: 9000,
      movingTimeS: null,
      liftAssisted: false,
      location: "Massif des Bauges",
      notes: null,
    });
    expect(new Date(data.startedAt).toISOString()).toBe("2026-10-24T10:00:00.000Z");
    const morning = toRideData({ ...trail, startTime: "08:30" }, "Europe/Paris");
    expect(new Date(morning.startedAt).toISOString()).toBe("2026-10-24T06:30:00.000Z");
  });

  it("makes a bike park day lift-assisted, with its descent time and runs", () => {
    expect(toRideData(park, "Europe/Paris")).toMatchObject({
      liftAssisted: true,
      totalTimeS: 6 * 3600,
      descentTimeS: 2 * 3600 + 600,
      runsCount: 14,
    });
  });
});
