import { describe, expect, it } from "vitest";
import { cleanName, nameKey } from "./names";

describe("names", () => {
  it("cleans a typed name", () => {
    expect(cleanName("  Le   Lourd ")).toBe("Le Lourd");
  });

  it("compares names without case, accents or extra spaces", () => {
    expect(nameKey("Le Lourd")).toBe(nameKey("  le   LOURD"));
    expect(nameKey("Vélo de route")).toBe(nameKey("velo de route"));
    expect(nameKey("Spectral")).not.toBe(nameKey("Spectral 2"));
  });
});
