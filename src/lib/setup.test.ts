import { describe, expect, it } from "vitest";
import {
  NO_CLICKS,
  adjustersOf,
  emptyValues,
  formatSag,
  formatSagTargetMm,
  formatSagTargetPercent,
  isSuspensionType,
  sagPercent,
  setupPrefill,
  suspensionValueErrors,
} from "./setup";
import type { SetupInput, SuspensionSpecsInput } from "./view-models";

const FORK = 1;
const SHOCK = 2;
const OLD_FORK = 9;

const forkSpecs: SuspensionSpecsInput = {
  springType: "air",
  travelMm: 160,
  wheelTravelMm: null,
  maxClicks: { ...NO_CLICKS, low_speed_rebound: 18, high_speed_compression: 8 },
};

function setup(overrides: Partial<SetupInput> = {}): SetupInput {
  return {
    setOn: "2026-10-17",
    label: "Bike park",
    notes: "Réceptions",
    tireFrontPressureBar: 1.7,
    tireRearPressureBar: 1.85,
    suspensions: [
      { ...emptyValues(FORK), airPressurePsi: 84, sagMm: 30 },
      { ...emptyValues(SHOCK), airPressurePsi: 195 },
    ],
    ...overrides,
  };
}

describe("setup helpers", () => {
  it("knows the suspension types", () => {
    expect(isSuspensionType("fork")).toBe(true);
    expect(isSuspensionType("rear_shock")).toBe(true);
    expect(isSuspensionType("tire")).toBe(false);
  });

  it("computes the sag as a share of the part's own travel", () => {
    expect(sagPercent(32, 160)).toBe(20);
    expect(sagPercent(19, null)).toBeNull();
    expect(sagPercent(null, 160)).toBeNull();
    expect(formatSag(32, 160)).toBe("32 mm · 20 %");
    expect(formatSag(17.5, null)).toBe("17,5 mm");
  });

  it("lists the adjusters a part has, rebound first", () => {
    expect(adjustersOf(forkSpecs)).toEqual([
      { code: "low_speed_rebound", maxClicks: 18 },
      { code: "high_speed_compression", maxClicks: 8 },
    ]);
    expect(adjustersOf(null)).toEqual([]);
  });

  it("starts a new setup from the current one, dated today and unnamed", () => {
    const { values, skipped } = setupPrefill(
      [{ componentId: FORK }, { componentId: SHOCK }],
      setup(),
      "2026-11-01",
    );
    expect(values).toMatchObject({ setOn: "2026-11-01", label: null, notes: null });
    expect(values.tireFrontPressureBar).toBe(1.7);
    expect(values.suspensions.map((s) => s.airPressurePsi)).toEqual([84, 195]);
    expect(skipped).toBe(0);
  });

  it("gives an empty part (a new fork) empty values", () => {
    const { values } = setupPrefill([{ componentId: 7 }], setup(), "2026-11-01");
    expect(values.suspensions).toEqual([emptyValues(7)]);
  });

  it("restores an older setup for the parts still fitted, current values for the others", () => {
    const old = setup({
      setOn: "2026-05-02",
      label: "Rando",
      tireFrontPressureBar: 1.6,
      suspensions: [
        { ...emptyValues(OLD_FORK), airPressurePsi: 70 },
        { ...emptyValues(SHOCK), airPressurePsi: 185 },
      ],
    });
    const { values, skipped } = setupPrefill(
      [{ componentId: FORK }, { componentId: SHOCK }],
      setup(),
      "2026-11-01",
      old,
    );
    expect(values.label).toBe("Rando");
    expect(values.tireFrontPressureBar).toBe(1.6);
    expect(values.suspensions.map((s) => [s.componentId, s.airPressurePsi])).toEqual([
      [FORK, 84],
      [SHOCK, 185],
    ]);
    expect(skipped).toBe(1);
  });

  it("checks the values against the part's specs", () => {
    const values = {
      ...emptyValues(FORK),
      sagMm: 170,
      clicks: {
        ...NO_CLICKS,
        low_speed_rebound: 19,
        high_speed_rebound: 2,
        high_speed_compression: 8,
      },
    };
    expect(suspensionValueErrors(values, forkSpecs)).toEqual({
      "1.low_speed_rebound": "Au plus 18 clics.",
      "1.high_speed_rebound": "Cette pièce n'a pas cette molette.",
      "1.sagMm": "Plus que la course de la pièce (160\u00a0mm).",
    });
    expect(suspensionValueErrors(values, null)).toEqual({});
  });

  it("gives the sag target in % and in mm for the part's travel", () => {
    const fork = { minPercent: 15, maxPercent: 20 };
    expect(formatSagTargetPercent(fork)).toBe("15–20\u00a0%");
    expect(formatSagTargetMm(fork, 170)).toBe("25,5–34\u00a0mm");
    expect(formatSagTargetMm(fork, null)).toBeNull();
    const coil = { minPercent: 30, maxPercent: 30 };
    expect(formatSagTargetPercent(coil)).toBe("≈\u00a030\u00a0%");
    expect(formatSagTargetMm(coil, 65)).toBe("≈\u00a019,5\u00a0mm");
  });
});
