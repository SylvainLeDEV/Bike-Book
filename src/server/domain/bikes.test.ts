import { describe, expect, it } from "vitest";
import { canBeRidden, defaultRideType, isListedFirst, resolveBikeStatus } from "./bikes";

const TODAY = "2026-10-25";
const input = {
  status: "active" as const,
  soldOn: null,
  salePriceCents: null,
  purchasedOn: "2024-03-14",
};

describe("resolveBikeStatus", () => {
  it("makes a new active bike active since its purchase, else since today", () => {
    expect(resolveBikeStatus(null, input, TODAY)).toEqual({
      status: "active",
      statusChangedOn: "2024-03-14",
      salePriceCents: null,
    });
    expect(resolveBikeStatus(null, { ...input, purchasedOn: null }, TODAY).statusChangedOn).toBe(
      TODAY,
    );
  });

  it("keeps the start date while the status does not change", () => {
    const previous = { status: "stored" as const, statusChangedOn: "2025-11-02" };
    expect(resolveBikeStatus(previous, { ...input, status: "stored" }, TODAY)).toEqual({
      status: "stored",
      statusChangedOn: "2025-11-02",
      salePriceCents: null,
    });
  });

  it("dates any other change today", () => {
    const previous = { status: "active" as const, statusChangedOn: "2024-03-14" };
    expect(resolveBikeStatus(previous, { ...input, status: "retired" }, TODAY)).toEqual({
      status: "retired",
      statusChangedOn: TODAY,
      salePriceCents: null,
    });
  });

  it("records the sale date and price of a sold bike", () => {
    const previous = { status: "active" as const, statusChangedOn: "2024-03-14" };
    const sold = {
      ...input,
      status: "sold" as const,
      soldOn: "2026-09-30",
      salePriceCents: 210_000,
    };
    expect(resolveBikeStatus(previous, sold, TODAY)).toEqual({
      status: "sold",
      statusChangedOn: "2026-09-30",
      salePriceCents: 210_000,
    });
    expect(resolveBikeStatus(previous, { ...sold, soldOn: null }, TODAY).statusChangedOn).toBe(
      TODAY,
    );
  });

  it("drops the sale price when the bike is no longer sold", () => {
    const previous = { status: "sold" as const, statusChangedOn: "2026-09-30" };
    const back = { ...input, status: "active" as const, salePriceCents: 210_000 };
    expect(resolveBikeStatus(previous, back, TODAY)).toEqual({
      status: "active",
      statusChangedOn: TODAY,
      salePriceCents: null,
    });
  });
});

describe("bike lists", () => {
  it("lists active bikes first and offers ridable ones in the quick entry", () => {
    expect(isListedFirst("active")).toBe(true);
    expect(isListedFirst("stored")).toBe(false);
    expect(canBeRidden("stored")).toBe(true);
    expect(canBeRidden("sold")).toBe(false);
  });

  it("maps a discipline to the ride type offered first", () => {
    expect(defaultRideType("enduro")).toBe("enduro");
    expect(defaultRideType("city")).toBe("commute");
    expect(defaultRideType("dirt")).toBe("other");
  });
});
