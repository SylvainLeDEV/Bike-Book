import { describe, expect, it } from "vitest";
import {
  componentName,
  counterUnit,
  fittedSlots,
  occupiedSlot,
  replacementOrigin,
  type ComponentRecord,
} from "./components";
import type { RideUsage } from "./wear";

const T = (iso: string) => Date.parse(iso);
function part(fields: Partial<ComponentRecord> & Pick<ComponentRecord, "id">): ComponentRecord {
  return {
    typeCode: "chain",
    position: "none",
    brand: "SRAM",
    model: "GX Eagle",
    specs: null,
    origin: "stock",
    replacesComponentId: null,
    installedAt: T("2024-03-13T23:00:00Z"),
    removedAt: null,
    removalReason: null,
    removalNote: null,
    initialDistanceM: 0,
    initialWearS: 0,
    ...fields,
  };
}
const rideAt = (iso: string, km: number): RideUsage => ({
  id: Math.round(T(iso) / 1000),
  startedAt: T(iso),
  liftAssisted: false,
  distanceM: km * 1000,
  descentDistanceM: null,
  totalTimeS: 3600,
  movingTimeS: null,
  descentTimeS: null,
});

describe("components", () => {
  it("names a part with its travel when known", () => {
    expect(
      componentName({ brand: "RockShox", model: "Lyrik Ultimate", specs: { travel_mm: 160 } }),
    ).toBe("RockShox Lyrik Ultimate · 160 mm");
    expect(componentName({ brand: null, model: "Organiques", specs: null })).toBe("Organiques");
  });

  it("counts suspension in hours and the rest in kilometres", () => {
    expect(counterUnit("suspension")).toBe("duration_s");
    expect(counterUnit("drivetrain")).toBe("distance_m");
  });

  it("follows each fitted part back to the original, with the wear at each removal", () => {
    const original = part({ id: 1, removedAt: T("2025-06-06T21:59:59Z"), removalReason: "worn" });
    const second = part({
      id: 2,
      origin: "replacement",
      replacesComponentId: 1,
      installedAt: T("2025-06-06T21:59:59Z"),
      removedAt: T("2026-10-12T21:59:59Z"),
      removalReason: "worn",
      removalNote: "allongement 0,5 %",
    });
    const today = part({
      id: 3,
      origin: "replacement",
      replacesComponentId: 2,
      installedAt: T("2026-10-12T21:59:59Z"),
    });
    const fork = part({ id: 4, typeCode: "fork" });
    const rides = [
      rideAt("2025-01-10T11:00:00Z", 100),
      rideAt("2026-01-10T11:00:00Z", 200),
      rideAt("2026-10-20T11:00:00Z", 40),
    ];
    const slots = fittedSlots([today, original, fork, second], rides);
    const chain = slots.find((slot) => slot.fitted.id === 3)!;
    expect(chain.lineage.map((p) => p.id)).toEqual([1, 2]);
    expect(chain.lineage.map((p) => p.counter.distanceM)).toEqual([100_000, 200_000]);
    expect(chain.fitted.counter.distanceM).toBe(40_000);
    expect(slots.find((slot) => slot.fitted.id === 4)!.lineage).toEqual([]);
  });

  it("finds the part already fitted in a single slot", () => {
    const parts = [
      part({ id: 1, typeCode: "tire", position: "front" }),
      part({ id: 2, typeCode: "tire", position: "rear", removedAt: 5, removalReason: "worn" }),
    ];
    const slot = { typeCode: "tire" as const, singleSlot: true };
    expect(occupiedSlot(parts, { ...slot, position: "front" })?.id).toBe(1);
    expect(occupiedSlot(parts, { ...slot, position: "rear" })).toBeUndefined();
    expect(occupiedSlot(parts, { ...slot, position: "front" }, 1)).toBeUndefined();
    expect(occupiedSlot(parts, { ...slot, position: "front", singleSlot: false })).toBeUndefined();
  });

  it("marks a part fitted for an upgrade as an upgrade", () => {
    expect(replacementOrigin("upgrade")).toBe("upgrade");
    expect(replacementOrigin("crash")).toBe("replacement");
  });
});
