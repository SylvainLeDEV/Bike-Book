import { describe, expect, it } from "vitest";
import { COMPONENT_TYPE_CODES } from "@/lib/enums";
import { COMPONENT_TYPE_LABELS } from "@/lib/labels";
import { createTestContext } from "@/test/context";
import { getDb } from "./client";
import { listComponentTypes, listRuleTemplates } from "./index";
import { ruleTemplates } from "./schema";

describe("reference data", () => {
  it("is created by the migrations, without any seed", () => {
    const types = listComponentTypes();
    expect(types.map((t) => t.code).sort()).toEqual([...COMPONENT_TYPE_CODES].sort());
    // Every code has a French label in the UI (D-50: labels live in the UI only).
    for (const type of types) expect(COMPONENT_TYPE_LABELS[type.code]).toBeTruthy();
    expect(types.find((t) => t.code === "brake_pads")).toEqual({
      code: "brake_pads",
      componentGroup: "brakes",
      hasPosition: true,
      singleSlot: true,
    });
    expect(types.find((t) => t.code === "other")?.singleSlot).toBe(false);
  });

  it("offers the built-in templates with their source and evidence level", () => {
    const ctx = createTestContext("Ref");
    const templates = listRuleTemplates(ctx);
    expect(templates).toHaveLength(8);
    expect(templates.every((t) => t.builtIn && t.code)).toBe(true);
    expect(listRuleTemplates(ctx, "fork").map((t) => t.code)).toEqual([
      "rockshox_fork_lower_leg_service",
      "fox_fork_full_service",
    ]);
    expect(listRuleTemplates(ctx, "chain")[0]).toMatchObject({
      intervalDistanceM: 500_000,
      source: "common_practice",
      evidenceLevel: "estimate",
    });
    expect(listRuleTemplates(ctx, null).map((t) => t.code)).toEqual(["bike_general_check"]);
  });

  it("keeps a workspace's own templates to itself", () => {
    const owner = createTestContext("Owner");
    const other = createTestContext("Other");
    getDb()
      .insert(ruleTemplates)
      .values({
        workspaceId: owner.workspace.id,
        componentTypeCode: "chain",
        title: "Chaîne : contrôle maison",
        intervalDistanceM: 300_000,
        source: "personal",
        evidenceLevel: "estimate",
      })
      .run();
    expect(listRuleTemplates(owner, "chain")).toHaveLength(2);
    expect(listRuleTemplates(other, "chain")).toHaveLength(1);
  });

  it("lets the database refuse a template without an interval or a custom one with a code", () => {
    const ctx = createTestContext("Checks");
    const insert = (values: Partial<typeof ruleTemplates.$inferInsert>) => () =>
      getDb()
        .insert(ruleTemplates)
        .values({
          workspaceId: ctx.workspace.id,
          title: "Test",
          source: "personal",
          evidenceLevel: "estimate",
          intervalDays: 30,
          ...values,
        })
        .run();
    expect(insert({ intervalDays: null })).toThrow(/CHECK constraint failed/);
    expect(insert({ intervalDays: 0 })).toThrow(/CHECK constraint failed/);
    expect(insert({ code: "mine" })).toThrow(/CHECK constraint failed/);
    expect(insert({ workspaceId: null })).toThrow(/CHECK constraint failed/);
  });
});
