import { describe, expect, it } from "vitest";
import { createTestContext } from "@/test/context";
import {
  createBike,
  createComponent,
  createMaintenanceEvent,
  createRule,
  listRuleResets,
  listRules,
  listRuleTemplates,
  snoozeRule,
  updateRule,
  type BikeData,
  type ComponentData,
  type RuleData,
} from "./index";

const bike = {
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
} satisfies BikeData;

const part: ComponentData = {
  brand: "SRAM",
  model: "GX",
  reference: null,
  origin: "stock",
  installedAt: Date.parse("2024-03-13T23:00:00Z"),
  initialDistanceM: 0,
  initialWearS: 0,
  purchasedOn: null,
  purchasePriceCents: null,
  shop: null,
  warrantyEndsOn: null,
  notes: null,
};

const yearly: RuleData = {
  componentTypeCode: null,
  position: null,
  title: "Contrôle général du vélo",
  intervalDistanceM: null,
  intervalWearS: null,
  intervalDays: 365,
  warnRatio: 0.9,
  resetOnReplacement: false,
  counterStartAt: Date.parse("2024-03-13T23:00:00Z"),
  active: true,
  notes: null,
};

function setup(name: string) {
  const ctx = createTestContext(name);
  const created = createBike(ctx, bike);
  if (!created.ok) throw new Error("bike");
  return { ctx, bikeId: created.bikeId };
}

describe("maintenance rules", () => {
  it("copies the chosen templates for a new part's slot, from its fitting", () => {
    const { ctx, bikeId } = setup("Camille");
    const chainTemplate = listRuleTemplates(ctx, "chain")[0];
    const forkTemplate = listRuleTemplates(ctx, "fork")[0];
    const created = createComponent(ctx, bikeId, { typeCode: "chain", position: "none" }, part, [
      chainTemplate.id,
      forkTemplate.id,
      chainTemplate.id,
    ]);
    expect(created.ok).toBe(true);
    // The fork template does not fit a chain: only the chain rule is created, once.
    expect(listRules(ctx, bikeId)).toMatchObject([
      {
        componentTypeCode: "chain",
        position: null,
        templateId: chainTemplate.id,
        title: "Contrôle d'usure de la chaîne",
        intervalDistanceM: 500_000,
        counterStartAt: part.installedAt,
        active: true,
      },
    ]);
  });

  it("creates, updates and snoozes a rule, returning the previous snooze", () => {
    const { ctx, bikeId } = setup("Alex");
    const created = createRule(ctx, bikeId, yearly);
    if (!created.ok) throw new Error(created.reason);
    updateRule(ctx, created.ruleId, { ...yearly, intervalDays: 180 });
    expect(listRules(ctx, bikeId)[0].intervalDays).toBe(180);
    expect(snoozeRule(ctx, created.ruleId, "2026-11-08")).toEqual({ ok: true, previous: null });
    expect(snoozeRule(ctx, created.ruleId, null)).toEqual({ ok: true, previous: "2026-11-08" });
  });

  it("links a maintenance line to a rule of the same bike only", () => {
    const { ctx, bikeId } = setup("Lines");
    const other = createBike(ctx, { ...bike, name: "Le Lourd" });
    if (!other.ok) throw new Error("bike");
    const rule = createRule(ctx, bikeId, yearly);
    if (!rule.ok) throw new Error(rule.reason);
    const line = {
      action: "inspected" as const,
      componentId: null,
      ruleId: rule.ruleId,
      description: null,
      costCents: null,
      measurementValue: null,
      measurementUnit: null,
    };
    const event = {
      performedOn: "2026-03-02",
      title: "Contrôle",
      performedBy: "self" as const,
      shop: null,
      totalCostCents: null,
      notes: null,
      recordedAt: Date.parse("2026-03-05T10:00:00Z"),
      lines: [line],
    };
    expect(createMaintenanceEvent(ctx, { ...event, bikeId: other.bikeId })).toEqual({
      ok: false,
      reason: "unknown_rule",
    });
    const done = createMaintenanceEvent(ctx, { ...event, bikeId });
    if (!done.ok) throw new Error(done.reason);
    expect(listRuleResets(ctx, bikeId)).toEqual([
      {
        ruleId: rule.ruleId,
        eventId: done.eventId,
        on: "2026-03-02",
        recordedAt: Date.parse("2026-03-05T10:00:00Z"),
      },
    ]);
  });

  it("keeps each workspace's rules to itself", () => {
    const { ctx: owner, bikeId } = setup("Owner");
    const { ctx: intruder } = setup("Intruder");
    const rule = createRule(owner, bikeId, yearly);
    if (!rule.ok) throw new Error(rule.reason);
    expect(listRules(intruder, bikeId)).toEqual([]);
    expect(listRules(intruder, null)).toEqual([]);
    expect(listRuleResets(intruder, bikeId)).toEqual([]);
    expect(createRule(intruder, bikeId, yearly)).toEqual({ ok: false, reason: "not_found" });
    expect(updateRule(intruder, rule.ruleId, { ...yearly, title: "X" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(snoozeRule(intruder, rule.ruleId, "2026-12-01")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(listRules(owner, bikeId)[0]).toMatchObject({ title: yearly.title, snoozeEndsOn: null });
  });
});
