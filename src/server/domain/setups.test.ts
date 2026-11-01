import { describe, expect, it } from "vitest";
import { NO_CLICKS, emptyValues } from "@/lib/setup";
import type { SetupInput } from "@/lib/view-models";
import { setupChanges } from "./setups";

function setup(overrides: Partial<SetupInput> = {}): SetupInput {
  return {
    setOn: "2026-05-02",
    label: null,
    notes: null,
    tireFrontPressureBar: 1.6,
    tireRearPressureBar: null,
    suspensions: [
      { ...emptyValues(1), airPressurePsi: 80, clicks: { ...NO_CLICKS, low_speed_rebound: 9 } },
    ],
    ...overrides,
  };
}

describe("setupChanges", () => {
  it("lists every value given in the first setup", () => {
    expect(setupChanges(null, setup())).toEqual([
      { componentId: 1, field: "airPressurePsi", from: null, to: 80 },
      { componentId: 1, field: "low_speed_rebound", from: null, to: 9 },
      { componentId: null, field: "tireFrontPressureBar", from: null, to: 1.6 },
    ]);
  });

  it("lists what differs from the previous setup, cleared values included", () => {
    const next = setup({
      tireFrontPressureBar: 1.7,
      suspensions: [{ ...emptyValues(1), airPressurePsi: 84, clicks: { ...NO_CLICKS } }],
    });
    expect(setupChanges(setup(), next)).toEqual([
      { componentId: 1, field: "airPressurePsi", from: 80, to: 84 },
      { componentId: 1, field: "low_speed_rebound", from: 9, to: null },
      { componentId: null, field: "tireFrontPressureBar", from: 1.6, to: 1.7 },
    ]);
  });

  it("starts a new part from nothing: a new fork's values are all listed", () => {
    const next = setup({ suspensions: [{ ...emptyValues(5), airPressurePsi: 70 }] });
    expect(setupChanges(setup(), next)).toEqual([
      { componentId: 5, field: "airPressurePsi", from: null, to: 70 },
    ]);
  });

  it("finds nothing when nothing changed", () => {
    expect(setupChanges(setup(), setup({ setOn: "2026-06-01", label: "Copie" }))).toEqual([]);
  });
});
