import { describe, expect, it } from "vitest";
import {
  defaultLevelAfter,
  levelsAfter,
  partsCostCents,
  uncheckedSteps,
  uncheckedText,
} from "./runs";

describe("run summary (D-87)", () => {
  it("takes a product one level down by default, never to empty by itself", () => {
    expect(defaultLevelAfter("full")).toBe("started");
    expect(defaultLevelAfter("started")).toBe("low");
    expect(defaultLevelAfter("low")).toBe("low");
    expect(defaultLevelAfter("empty")).toBe("empty");
    expect(levelsAfter("started")).toEqual(["started", "low", "empty"]);
  });

  it("costs the parts taken at their last purchase price", () => {
    const parts = [
      { itemId: 1, lastUnitCostCents: 450 },
      { itemId: 2, lastUnitCostCents: null },
    ];
    expect(partsCostCents(parts, { 1: 2, 2: 1 })).toBe(900);
    expect(partsCostCents(parts, { 1: 0, 2: 3 })).toBeNull();
    expect(partsCostCents(parts, {})).toBeNull();
  });

  it("points out the steps not checked", () => {
    expect(
      uncheckedSteps([{ done: true }, { done: false }, { done: true }, { done: false }]),
    ).toEqual([2, 4]);
    expect(uncheckedText([2, 4])).toBe("Les étapes 2 et 4 ne sont pas cochées.");
    expect(uncheckedText([1, 2, 3])).toBe("Les étapes 1, 2 et 3 ne sont pas cochées.");
    expect(uncheckedText([3])).toBe("L'étape 3 n'est pas cochée.");
    expect(uncheckedText([])).toBeNull();
  });
});
