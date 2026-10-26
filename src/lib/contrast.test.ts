import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance, toHex } from "./contrast";

describe("contrast", () => {
  it("gives the WCAG reference values", () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1);
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBe(1);
  });

  it("does not depend on the order of the colours", () => {
    const grey: [number, number, number] = [118, 118, 118];
    expect(contrastRatio(grey, [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(contrastRatio([255, 255, 255], grey)).toBeCloseTo(4.54, 2);
  });

  it("writes hex codes", () => {
    expect(toHex([86, 212, 212])).toBe("#56d4d4");
  });
});
