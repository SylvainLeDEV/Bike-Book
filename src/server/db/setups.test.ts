import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import {
  createBike,
  createComponent,
  createSetup,
  deleteSetup,
  getSetupBikeId,
  listSetups,
  listSuspensionSpecs,
  replaceComponent,
  saveSuspensionSpecs,
  updateComponent,
  updateSetup,
  type AccessContext,
  type BikeData,
  type ComponentData,
  type SetupData,
  type SuspensionSpecsData,
  type SuspensionValues,
} from "./index";

const T = (iso: string) => Date.parse(iso);

const bike: BikeData = {
  name: "Spectral",
  discipline: "enduro",
  isElectric: false,
  brand: null,
  model: null,
  modelYear: null,
  frameSize: null,
  wheelSize: null,
  color: null,
  frameSerial: null,
  weightG: null,
  purchasedOn: "2024-03-14",
  purchasePriceCents: null,
  purchaseShop: null,
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
  status: "active",
  statusChangedOn: "2024-03-14",
  salePriceCents: null,
  notes: null,
};

const NO_CLICKS = {
  low_speed_rebound: null,
  high_speed_rebound: null,
  low_speed_compression: null,
  high_speed_compression: null,
};

const airFork: SuspensionSpecsData = {
  springType: "air",
  travelMm: 160,
  maxClicks: { ...NO_CLICKS, low_speed_rebound: 18, low_speed_compression: 5 },
};

const part = (suspension?: SuspensionSpecsData | null): ComponentData => ({
  brand: "RockShox",
  model: "Lyrik",
  reference: null,
  origin: "stock",
  installedAt: T("2024-03-13T23:00:00Z"),
  initialDistanceM: 0,
  initialWearS: 0,
  purchasedOn: null,
  purchasePriceCents: null,
  shop: null,
  warrantyEndsOn: null,
  notes: null,
  suspension,
});

function garage(name: string) {
  const ctx = createTestContext(name);
  const created = createBike(ctx, bike);
  if (!created.ok) throw new Error("bike");
  const fork = createComponent(
    ctx,
    created.bikeId,
    { typeCode: "fork", position: "none" },
    part(airFork),
  );
  const shock = createComponent(
    ctx,
    created.bikeId,
    { typeCode: "rear_shock", position: "none" },
    part({ springType: "coil", travelMm: 65, maxClicks: { ...NO_CLICKS } }),
  );
  if (!fork.ok || !shock.ok) throw new Error("parts");
  return { ctx, bikeId: created.bikeId, forkId: fork.componentId, shockId: shock.componentId };
}

const values = (componentId: number, fields: Partial<SuspensionValues> = {}): SuspensionValues => ({
  componentId,
  airPressurePsi: null,
  springRateLbPerIn: null,
  volumeSpacers: null,
  sagMm: null,
  clicks: { ...NO_CLICKS },
  ...fields,
});

const data = (overrides: Partial<SetupData> = {}): SetupData => ({
  setOn: "2026-10-17",
  label: "Bike park",
  notes: null,
  tireFrontPressureBar: 1.7,
  tireRearPressureBar: 1.85,
  suspensions: [],
  ...overrides,
});

function add(ctx: AccessContext, bikeId: number, setupData: SetupData) {
  const outcome = createSetup(ctx, bikeId, setupData);
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.setupId;
}

describe("suspension specs", () => {
  it("are written with the part and listed per bike", () => {
    const { ctx, bikeId, forkId, shockId } = garage("Camille");
    expect(listSuspensionSpecs(ctx, bikeId)).toEqual([
      { componentId: forkId, ...airFork },
      {
        componentId: shockId,
        springType: "coil",
        travelMm: 65,
        maxClicks: { ...NO_CLICKS },
      },
    ]);
  });

  it("are dropped when a fork becomes rigid, and left alone when not given", () => {
    const { ctx, bikeId, forkId } = garage("Camille");
    expect(updateComponent(ctx, forkId, part(undefined)).ok).toBe(true);
    expect(listSuspensionSpecs(ctx, bikeId).map((s) => s.componentId)).toContain(forkId);
    expect(updateComponent(ctx, forkId, part(null)).ok).toBe(true);
    expect(listSuspensionSpecs(ctx, bikeId).map((s) => s.componentId)).not.toContain(forkId);
  });

  it("are ignored on a part that is not a fork or a shock", () => {
    const { ctx, bikeId } = garage("Camille");
    const chain = createComponent(
      ctx,
      bikeId,
      { typeCode: "chain", position: "none" },
      part(airFork),
    );
    expect(chain.ok).toBe(true);
    expect(listSuspensionSpecs(ctx, bikeId)).toHaveLength(2);
  });

  it("stay in their workspace", () => {
    const { bikeId } = garage("Camille");
    expect(listSuspensionSpecs(createTestContext("Lou"), bikeId)).toEqual([]);
  });

  it("are saved from the setup tab for a fork or a shock of the workspace (D-83)", () => {
    const { ctx, bikeId, forkId } = garage("Camille");
    const hsr = { ...airFork, maxClicks: { ...airFork.maxClicks, high_speed_rebound: 10 } };
    expect(saveSuspensionSpecs(ctx, forkId, hsr)).toBe(true);
    expect(listSuspensionSpecs(ctx, bikeId).find((s) => s.componentId === forkId)).toEqual({
      componentId: forkId,
      ...hsr,
    });
    const chain = createComponent(ctx, bikeId, { typeCode: "chain", position: "none" }, part());
    if (!chain.ok) throw new Error("chain");
    expect(saveSuspensionSpecs(ctx, chain.componentId, hsr)).toBe(false);
    expect(saveSuspensionSpecs(createTestContext("Lou"), forkId, airFork)).toBe(false);
  });
});

describe("setups", () => {
  it("lists a bike's setups, the latest date first, values with them", () => {
    const { ctx, bikeId, forkId, shockId } = garage("Camille");
    add(ctx, bikeId, data({ setOn: "2026-05-02", label: "Rando" }));
    const id = add(
      ctx,
      bikeId,
      data({
        suspensions: [
          values(forkId, { airPressurePsi: 84, clicks: { ...NO_CLICKS, low_speed_rebound: 9 } }),
          values(shockId, { springRateLbPerIn: 450, sagMm: 19 }),
        ],
      }),
    );
    // Recorded later but dated earlier: not the current one.
    add(ctx, bikeId, data({ setOn: "2026-01-10", label: "Hiver" }));
    const setups = listSetups(ctx, bikeId);
    expect(setups.map((s) => s.label)).toEqual(["Bike park", "Rando", "Hiver"]);
    expect(setups[0].id).toBe(id);
    expect(setups[0].suspensions).toEqual([
      values(forkId, { airPressurePsi: 84, clicks: { ...NO_CLICKS, low_speed_rebound: 9 } }),
      values(shockId, { springRateLbPerIn: 450, sagMm: 19 }),
    ]);
    expect(getSetupBikeId(ctx, id)).toBe(bikeId);
  });

  it("keeps no row for a part with nothing given", () => {
    const { ctx, bikeId, forkId } = garage("Camille");
    const id = add(ctx, bikeId, data({ suspensions: [values(forkId)] }));
    expect(listSetups(ctx, bikeId).find((s) => s.id === id)?.suspensions).toEqual([]);
  });

  it("refuses a part of another bike, or one that is not a fork or a shock", () => {
    const { ctx, bikeId } = garage("Camille");
    const other = createBike(ctx, { ...bike, name: "Gravel" });
    if (!other.ok) throw new Error("bike");
    const otherFork = createComponent(
      ctx,
      other.bikeId,
      { typeCode: "fork", position: "none" },
      part(airFork),
    );
    const chain = createComponent(ctx, bikeId, { typeCode: "chain", position: "none" }, part());
    if (!otherFork.ok || !chain.ok) throw new Error("parts");
    for (const componentId of [otherFork.componentId, chain.componentId]) {
      expect(
        createSetup(ctx, bikeId, data({ suspensions: [values(componentId, { sagMm: 30 })] })),
      ).toEqual({
        ok: false,
        reason: "invalid_part",
      });
    }
  });

  it("rewrites a setup and its values, then deletes it", () => {
    const { ctx, bikeId, forkId, shockId } = garage("Camille");
    const id = add(ctx, bikeId, data({ suspensions: [values(forkId, { airPressurePsi: 84 })] }));
    const outcome = updateSetup(
      ctx,
      id,
      data({ label: null, notes: "Corrigé", suspensions: [values(shockId, { sagMm: 18 })] }),
    );
    expect(outcome).toEqual({ ok: true, setupId: id });
    const [stored] = listSetups(ctx, bikeId);
    expect(stored).toMatchObject({ label: null, notes: "Corrigé" });
    expect(stored.suspensions).toEqual([values(shockId, { sagMm: 18 })]);
    expect(deleteSetup(ctx, id)).toBe(true);
    expect(listSetups(ctx, bikeId)).toEqual([]);
  });

  it("keeps the values of a replaced fork with that fork (D-79)", () => {
    const { ctx, bikeId, forkId } = garage("Camille");
    add(ctx, bikeId, data({ suspensions: [values(forkId, { airPressurePsi: 84 })] }));
    const replaced = replaceComponent(ctx, {
      removedComponentId: forkId,
      on: "2026-10-20",
      recordedAt: T("2026-10-20T10:00:00Z"),
      at: T("2026-10-20T10:00:00Z"),
      reason: "upgrade",
      removalNote: null,
      newPart: { brand: "Fox", model: "38", priceCents: null },
      eventTitle: "Fourche remplacée",
    });
    if (!replaced.ok) throw new Error(replaced.reason);
    const [stored] = listSetups(ctx, bikeId);
    expect(stored.suspensions.map((s) => s.componentId)).toEqual([forkId]);
    // The new fork has no specs: it starts from nothing.
    expect(listSuspensionSpecs(ctx, bikeId).map((s) => s.componentId)).not.toContain(
      replaced.newComponentId,
    );
  });

  it("stays in its workspace", () => {
    const { ctx, bikeId, forkId } = garage("Camille");
    const id = add(ctx, bikeId, data({ suspensions: [values(forkId, { sagMm: 30 })] }));
    const lou = createTestContext("Lou");
    expect(listSetups(lou, bikeId)).toEqual([]);
    expect(getSetupBikeId(lou, id)).toBeNull();
    expect(createSetup(lou, bikeId, data())).toEqual({ ok: false, reason: "not_found" });
    expect(updateSetup(lou, id, data())).toEqual({ ok: false, reason: "not_found" });
    expect(deleteSetup(lou, id)).toBe(false);
    expect(listSetups(ctx, bikeId)).toHaveLength(1);
  });
});
