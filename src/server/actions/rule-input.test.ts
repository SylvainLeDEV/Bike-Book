import { describe, expect, it } from "vitest";
import type { RuleInput } from "@/lib/view-models";
import { ruleInputSchema, toRuleData } from "./rule-input";

const input: RuleInput = {
  slot: "brake:*",
  title: " Purge des freins ",
  intervalDistanceM: null,
  intervalWearS: null,
  intervalDays: 365,
  warnRatio: 0.9,
  resetOnReplacement: true,
  lastDoneOn: "2026-09-26",
  active: true,
  notes: null,
};
const parse = (value: unknown) => ruleInputSchema("2026-10-25").safeParse(value);

describe("rule input", () => {
  it("requires an interval and a known slot", () => {
    const none = parse({ ...input, intervalDays: null });
    expect(none.success ? null : none.error.issues[0]?.message).toBe(
      "Indique au moins un intervalle : km, heures ou jours.",
    );
    expect(parse({ ...input, slot: "wing:front" }).success).toBe(false);
    expect(parse({ ...input, warnRatio: 1 }).success).toBe(false);
  });

  it("targets both sides, counting from the end of the day it was last done", () => {
    const parsed = parse(input);
    if (!parsed.success) throw new Error("expected valid");
    expect(toRuleData(parsed.data, 0, "Europe/Paris")).toMatchObject({
      componentTypeCode: "brake",
      position: null,
      title: "Purge des freins",
      counterStartAt: Date.parse("2026-09-26T21:59:59.999Z"),
    });
    const bikeLevel = toRuleData({ ...parsed.data, slot: "bike", lastDoneOn: null }, 42, "UTC");
    expect(bikeLevel).toMatchObject({
      componentTypeCode: null,
      position: null,
      resetOnReplacement: false,
      counterStartAt: 42,
    });
  });
});
