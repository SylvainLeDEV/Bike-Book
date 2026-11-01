import { describe, expect, it } from "vitest";
import { NO_CLICKS, emptyValues } from "@/lib/setup";
import type { Component, Setup, SuspensionSpecs } from "@/server/db";
import { setupTab } from "./setups";

const part = (id: number, fields: Partial<Component>): Component => ({
  id,
  bikeId: 2,
  typeCode: "fork",
  position: "none",
  brand: "Fox",
  model: "38",
  reference: null,
  specs: null,
  origin: "stock",
  replacesComponentId: null,
  installedAt: 0,
  initialDistanceM: 0,
  initialWearS: 0,
  removedAt: null,
  removalReason: null,
  removalNote: null,
  purchasedOn: null,
  purchasePriceCents: null,
  shop: null,
  warrantyEndsOn: null,
  notes: null,
  ...fields,
});

const fork = part(1, {});
const shock = part(2, { typeCode: "rear_shock", model: "Float X2" });
const forkSpecs: SuspensionSpecs = {
  componentId: 1,
  springType: "air",
  travelMm: 170,
  maxClicks: { ...NO_CLICKS, high_speed_compression: 15 },
};

describe("setupTab", () => {
  it("shows a mountain bike's fork before it is described (D-83)", () => {
    const vm = setupTab([fork, shock], [], [], true);
    expect(vm.units.map((u) => [u.typeCode, u.specs])).toEqual([
      ["fork", null],
      ["rear_shock", null],
    ]);
    expect(vm.rigidFork).toBeNull();
  });

  it("treats a fork without specs on another bike as rigid", () => {
    const vm = setupTab([fork], [], [], false);
    expect(vm.units).toEqual([]);
    expect(vm.rigidFork).toEqual({ componentId: 1, name: "Fox 38" });
    expect(setupTab([fork], [forkSpecs], [], false).units[0].specs?.travelMm).toBe(170);
  });

  it("lists the setups with what changed, fork first", () => {
    const base: Setup = {
      id: 1,
      bikeId: 2,
      setOn: "2026-05-02",
      label: null,
      notes: null,
      tireFrontPressureBar: 1.6,
      tireRearPressureBar: null,
      suspensions: [
        { ...emptyValues(2), airPressurePsi: 185 },
        { ...emptyValues(1), sagMm: 32 },
      ],
    };
    const next: Setup = {
      ...base,
      id: 2,
      setOn: "2026-10-17",
      suspensions: [
        { ...emptyValues(1), sagMm: 30 },
        { ...emptyValues(2), airPressurePsi: 185 },
      ],
    };
    const vm = setupTab([fork, shock], [forkSpecs], [next, base], true);
    expect(vm.entries[1].values.suspensions.map((s) => s.componentId)).toEqual([1, 2]);
    expect(vm.entries[0].changes).toEqual([
      { unit: "fork", field: "SAG", from: "32 mm", to: "30 mm" },
    ]);
    expect(vm.entries[1].first).toBe(true);
  });
});
