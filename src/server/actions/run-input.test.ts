import { describe, expect, it } from "vitest";
import { parseFinishRun, stepPatchSchema } from "./run-input";

const TODAY = "2026-11-02";
const AT = Date.parse("2026-11-02T10:00:00Z");

const input = (fields: Record<string, unknown> = {}) => ({
  performedOn: TODAY,
  title: "  Purge   des freins ",
  notes: "",
  laborMinutes: 45,
  action: "bled",
  componentId: 3,
  ruleId: null,
  costCents: 1200,
  joinEventId: null,
  parts: [
    { itemId: 1, quantity: 2 },
    { itemId: 2, quantity: 0 },
  ],
  products: [{ itemId: 4, levelAfter: "low" }],
  saveAsProcedure: false,
  ...fields,
});

describe("parseFinishRun (D-87)", () => {
  it("cleans the text, turns minutes into seconds and drops parts not taken", () => {
    const parsed = parseFinishRun(input(), TODAY, true, AT);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toMatchObject({
      at: AT,
      title: "Purge des freins",
      notes: null,
      laborTimeS: 2700,
      line: { action: "bled", componentId: 3, costCents: 1200 },
      parts: [{ itemId: 1, quantity: 2 }],
      products: [{ itemId: 4, levelAfter: "low" }],
    });
  });

  it("writes no line nor stock for a general task's run", () => {
    const parsed = parseFinishRun(input({ joinEventId: 8 }), TODAY, false, AT);
    expect(parsed.ok && parsed.data).toMatchObject({
      line: null,
      joinEventId: null,
      parts: [],
      products: [],
    });
  });

  it("refuses a future date, an empty title and a line that replaces", () => {
    expect(parseFinishRun(input({ performedOn: "2026-11-03" }), TODAY, true, AT)).toEqual({
      ok: false,
      error: "La date ne peut pas être dans le futur.",
    });
    expect(parseFinishRun(input({ title: "  " }), TODAY, true, AT)).toEqual({
      ok: false,
      error: "Donne un titre à l'entretien.",
    });
    expect(parseFinishRun(input({ action: "replaced" }), TODAY, true, AT).ok).toBe(false);
  });

  it("reads a step's patch: a check or a comment", () => {
    expect(stepPatchSchema.safeParse({ done: true }).success).toBe(true);
    expect(stepPatchSchema.parse({ comment: "  " })).toEqual({ comment: null });
    expect(stepPatchSchema.safeParse({}).success).toBe(false);
  });
});
