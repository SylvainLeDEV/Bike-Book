import { describe, expect, it } from "vitest";
import { NO_CLICKS, emptyValues } from "@/lib/setup";
import type { SuspensionSpecsInput } from "@/lib/view-models";
import { parseSetupInput } from "./setup-input";

const TODAY = "2026-11-01";

const specs: SuspensionSpecsInput = {
  springType: "air",
  travelMm: 160,
  maxClicks: { ...NO_CLICKS, low_speed_rebound: 18 },
};

const input = (overrides: Record<string, unknown> = {}) => ({
  setOn: "2026-10-17",
  label: "  Bike park ",
  notes: "",
  tireFrontPressureBar: 1.7,
  tireRearPressureBar: null,
  suspensions: [
    { ...emptyValues(4), airPressurePsi: 84, clicks: { ...NO_CLICKS, low_speed_rebound: 9 } },
  ],
  ...overrides,
});

describe("parseSetupInput", () => {
  it("cleans the text and keeps the values", () => {
    const parsed = parseSetupInput(input(), TODAY, () => specs);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.label).toBe("Bike park");
    expect(parsed.data.notes).toBeNull();
    expect(parsed.data.suspensions[0].clicks.low_speed_rebound).toBe(9);
  });

  it("names each error after its field, a part's by part and field", () => {
    const parsed = parseSetupInput(
      input({
        setOn: "2026-11-02",
        tireFrontPressureBar: 0,
        suspensions: [{ ...emptyValues(4), volumeSpacers: 1.5 }],
      }),
      TODAY,
      () => specs,
    );
    expect(parsed).toEqual({
      success: false,
      fieldErrors: {
        setOn: "La date ne peut pas être dans le futur.",
        tireFrontPressureBar: "Pression invalide (bar).",
        "4.volumeSpacers": "Entre 0 et 20 tokens.",
      },
    });
  });

  it("checks the clicks against the part's specs", () => {
    const parsed = parseSetupInput(
      input({
        suspensions: [
          {
            ...emptyValues(4),
            clicks: { ...NO_CLICKS, low_speed_rebound: 19, high_speed_rebound: 3 },
          },
        ],
      }),
      TODAY,
      () => specs,
    );
    expect(parsed).toEqual({
      success: false,
      fieldErrors: {
        "4.low_speed_rebound": "Au plus 18 clics.",
        "4.high_speed_rebound": "Cette pièce n'a pas cette molette.",
      },
    });
  });
});
