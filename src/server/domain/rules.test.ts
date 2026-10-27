import { describe, expect, it } from "vitest";
import { byUrgency, evaluateRule, type RuleDefinition, type SlotPart } from "./rules";
import type { RideUsage } from "./wear";

const PARIS = "Europe/Paris";
const H = 3600;
const T = (iso: string) => Date.parse(iso);
let rideId = 1;
const ride = (iso: string, fields: Partial<RideUsage>): RideUsage => ({
  id: rideId++,
  startedAt: T(iso),
  liftAssisted: false,
  distanceM: null,
  descentDistanceM: null,
  totalTimeS: null,
  movingTimeS: null,
  descentTimeS: null,
  ...fields,
});

const lowerLegs: RuleDefinition = {
  id: 11,
  componentTypeCode: "fork",
  position: null,
  intervalDistanceM: null,
  intervalWearS: 50 * H,
  intervalDays: null,
  warnRatio: 0.9,
  resetOnReplacement: true,
  counterStartAt: T("2024-03-13T23:00:00Z"),
  snoozeEndsOn: null,
};
const fork: SlotPart = {
  id: 1,
  typeCode: "fork",
  position: "none",
  installedAt: T("2024-03-13T23:00:00Z"),
  removedAt: null,
};
// Last done on 2026-05-10: a maintenance line linked to the rule, at the end of that day.
const done = { ruleId: 11, at: T("2026-05-10T21:59:59.999Z"), eventId: 7, on: "2026-05-10" };

describe("worked example of docs/03", () => {
  const park = ride("2026-06-14T10:00:00Z", {
    liftAssisted: true,
    totalTimeS: 6 * H,
    descentTimeS: 2 * H + 600,
  });
  const trails = Array.from({ length: 10 }, (_, i) =>
    ride(`2026-06-${String(16 + i).padStart(2, "0")}T10:00:00Z`, { movingTimeS: 2.5 * H }),
  );
  const parkDays = ["2026-07-04", "2026-07-11", "2026-07-18"].map((day) =>
    ride(`${day}T10:00:00Z`, { liftAssisted: true, totalTimeS: 6 * H }),
  );
  const context = {
    resets: [done],
    parts: [fork],
    now: T("2026-07-25T12:00:00Z"),
    today: "2026-07-25",
    timeZone: PARIS,
  };

  it("counts 45 h 10, 90 % of 50 h: due soon", () => {
    const result = evaluateRule(lowerLegs, { ...context, rides: [park, ...trails, ...parkDays] });
    expect(result.usage.wearS).toBe(45 * H + 10 * 60);
    expect(result.ratio).toBeCloseTo(0.9033, 3);
    expect(result.status).toBe("due_soon");
    expect(result.lastReset).toEqual({ kind: "maintenance", at: done.at, eventId: 7 });
    expect(result.rideIds).toHaveLength(14);
    expect(result.driving).toEqual({ unit: "duration_s", used: 45 * H + 600, interval: 50 * H });
  });

  it("counts 33 h 10 (66 %) when the bike park descent times are entered", () => {
    const withDescent = parkDays.map((r) => ({ ...r, descentTimeS: 2 * H }));
    const result = evaluateRule(lowerLegs, {
      ...context,
      rides: [park, ...trails, ...withDescent],
    });
    expect(result.usage.wearS).toBe(33 * H + 10 * 60);
    expect(result.ratio).toBeCloseTo(0.6633, 3);
    expect(result.status).toBe("ok");
  });

  it("ignores rides before the last reset", () => {
    const before = ride("2026-05-10T10:00:00Z", { movingTimeS: 10 * H });
    expect(evaluateRule(lowerLegs, { ...context, rides: [before] }).usage.wearS).toBe(0);
  });
});

describe("rule engine", () => {
  const base = { resets: [], parts: [fork], timeZone: PARIS };

  it("restarts on the fitting of a new part in the slot, unless told not to", () => {
    const newFork = { ...fork, id: 2, installedAt: T("2026-06-01T21:59:59.999Z") };
    const oldFork = { ...fork, removedAt: newFork.installedAt };
    const rides = [
      ride("2026-05-20T10:00:00Z", { movingTimeS: 5 * H }),
      ride("2026-06-10T10:00:00Z", { movingTimeS: 2 * H }),
    ];
    const context = {
      ...base,
      parts: [oldFork, newFork],
      rides,
      now: T("2026-06-20T10:00:00Z"),
      today: "2026-06-20",
    };
    expect(evaluateRule(lowerLegs, context)).toMatchObject({
      lastReset: { kind: "replacement", componentId: 2 },
      usage: { wearS: 2 * H },
    });
    expect(evaluateRule({ ...lowerLegs, resetOnReplacement: false }, context).usage.wearS).toBe(
      7 * H,
    );
  });

  it("follows one side only when the rule names it", () => {
    const rear = {
      id: 5,
      typeCode: "brake" as const,
      position: "rear" as const,
      installedAt: T("2026-06-01T10:00:00Z"),
      removedAt: null,
    };
    const bleedFront = {
      ...lowerLegs,
      componentTypeCode: "brake" as const,
      position: "front" as const,
    };
    const bleedBoth = { ...bleedFront, position: null };
    const context = {
      ...base,
      parts: [rear],
      rides: [],
      now: T("2026-06-20T10:00:00Z"),
      today: "2026-06-20",
    };
    expect(evaluateRule(bleedFront, context).lastReset.kind).toBe("start");
    expect(evaluateRule(bleedBoth, context).lastReset.kind).toBe("replacement");
  });

  it("dates day-based rules and marks them overdue past the interval", () => {
    const sealant: RuleDefinition = {
      ...lowerLegs,
      componentTypeCode: "tire",
      intervalWearS: null,
      intervalDays: 90,
      counterStartAt: T("2026-08-01T10:00:00Z"),
    };
    const dueSoon = evaluateRule(sealant, {
      ...base,
      rides: [],
      now: T("2026-10-25T10:00:00Z"),
      today: "2026-10-25",
    });
    expect(dueSoon).toMatchObject({
      status: "due_soon",
      dueOn: "2026-10-30",
      etaDays: 5,
      usage: { days: 85 },
    });
    const late = evaluateRule(sealant, {
      ...base,
      rides: [],
      now: T("2026-11-05T10:00:00Z"),
      today: "2026-11-05",
    });
    expect(late).toMatchObject({ status: "overdue", etaDays: null });
  });

  it("keeps a snoozed rule snoozed until its day, then shows its real status", () => {
    const snoozed = { ...lowerLegs, intervalWearS: H, snoozeEndsOn: "2026-07-01" };
    const rides = [ride("2026-06-10T10:00:00Z", { movingTimeS: 2 * H })];
    const context = { ...base, rides, resets: [done] };
    expect(
      evaluateRule(snoozed, { ...context, now: T("2026-06-20T10:00:00Z"), today: "2026-06-20" })
        .status,
    ).toBe("snoozed");
    expect(
      evaluateRule(snoozed, { ...context, now: T("2026-07-01T10:00:00Z"), today: "2026-07-01" })
        .status,
    ).toBe("overdue");
  });

  it("projects the due day from the pace of the last 8 weeks (an estimate)", () => {
    const chain = {
      ...lowerLegs,
      componentTypeCode: "chain" as const,
      intervalWearS: null,
      intervalDistanceM: 500_000,
    };
    // 280 km over the last 56 days = 5 km a day; 220 km left → 44 days.
    const rides = Array.from({ length: 8 }, (_, i) =>
      ride(new Date(T("2026-09-01T10:00:00Z") + i * 7 * 86_400_000).toISOString(), {
        distanceM: 35_000,
        movingTimeS: H,
      }),
    );
    const result = evaluateRule(chain, {
      ...base,
      parts: [],
      resets: [{ ...done, ruleId: chain.id, at: T("2026-08-30T10:00:00Z") }],
      rides,
      now: T("2026-10-26T10:00:00Z"),
      today: "2026-10-26",
    });
    expect(result.usage.distanceM).toBe(280_000);
    expect(result.etaDays).toBe(44);
    expect(result.dueOn).toBeNull();
  });

  it("sorts the most urgent first", () => {
    const rows = [
      { status: "ok" as const, ratio: 0.5 },
      { status: "overdue" as const, ratio: 1.1 },
      { status: "due_soon" as const, ratio: 0.92 },
      { status: "overdue" as const, ratio: 1.4 },
    ];
    expect(rows.sort(byUrgency).map((r) => r.ratio)).toEqual([1.4, 1.1, 0.92, 0.5]);
  });
});
